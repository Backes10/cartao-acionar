/* ==========================================================================
   Cartão Acionar — gera o contato (.vcf) + a imagem (.png) do seguro
   e entrega os dois no WhatsApp. Tudo roda no aparelho.
   ========================================================================== */

'use strict';

// Precisa bater com o VERSAO do sw.js. O diagnóstico mostra os dois lado a
// lado justamente para o vendedor perceber quando o aparelho está preso numa
// versão antiga: se divergirem, o service worker ainda não trocou.
const VERSAO_APP = 'v53';

const CHAVE_CONFIG = 'acionar.config';
const CHAVE_CATALOGO = 'acionar.seguradoras';
const CHAVE_HISTORICO = 'acionar.historico';
const CHAVE_RASCUNHO = 'acionar.rascunho';
const MAX_HISTORICO = 20;

// Logo que vem no projeto. É uma URL relativa, não base64: o canvas e o
// <img> aceitam as duas, e assim não ocupa espaço no localStorage.
// Na versão de arquivo único (build.py) o logo chega embutido como data URI.
const LOGO_PADRAO = window.LOGO_EMBUTIDO || 'assets/logo-acionar.png';

// Preenchido com os dados reais do cartão que a Acionar já envia hoje. Cores
// tiradas da própria arte: laranja #EB6522 e grafite #3A3737.
const CONFIG_PADRAO = {
  corretor: '',
  whatsapp: '(51) 99741-4049',
  telefone: '(51) 3566-0010',
  email: 'acionarseguros@acionarseguros.com.br',
  corretora: 'Acionar Corretora de Seguros',
  site: '',
  cor1: '#EB6522',
  cor2: '#3A3737',
  logo: LOGO_PADRAO,
  // Desligado por padrão: a foto embutida é ~14 KB de base64 e é o suspeito
  // principal do "vCard não compatível" que o WhatsApp devolve ao tentar
  // interpretar o arquivo. Sem ela o contato cai de 21 KB para ~7 KB. É só o
  // avatar na agenda do cliente — bonito, não essencial.
  fotoNoContato: false,
  // Ligado enquanto estamos testando o link. É a chave para voltar atrás sem
  // mexer em código: desligou, a mensagem volta a ser a de antes.
  linkNaMensagem: true,
  templates: {}
};

/** Endereço da página que abre os telefones clicáveis.
 *
 *  A imagem do cartão não aceita link: chega ao WhatsApp como mapa de pixels,
 *  sem camada clicável, nos dois sistemas. A mensagem aceita — e é por ela que
 *  o cliente ganha telefone de um toque, contato de um toque, e números que
 *  continuam certos quando a seguradora trocar de central.
 *
 *  Viaja uma coisa só: qual seguradora. Telefone é dela, não da apólice — e o
 *  contato personalizado já vai no .vcf do passo 3, com nome melhor do que a
 *  página conseguiria dar.
 *
 *  A versão anterior levava também o produto e o nome do contato, em base64. O
 *  endereço saía com 112 caracteres e ocupava seis linhas de texto azul na
 *  conversa. Agora são cerca de 50, legíveis, e a placa do carro não viaja
 *  mais dentro do link. */
// Caminho curto: cada caractere aqui é uma letra a mais de endereço azul na
// conversa. "/telefones/" dizia o que era, mas isso agora está na linha logo
// acima do link, escrita para o cliente ler e para a busca do WhatsApp achar.
const RAIZ_LINK = 'https://backes10.github.io/cartao-acionar/t/#';

function linkDoCartao() {
  if (!estado.config.linkNaMensagem || !estado.seguradoraId) return '';
  // Link que levaria o cliente para dado diferente do que está no cartão não
  // vai. Ver divergenciaDoLink().
  if (divergenciaDoLink().omitir) return '';
  return RAIZ_LINK + estado.seguradoraId;
}

/* ==========================================================================
   INDICAÇÃO POR QR CODE

   O cartão leva um QR que NÃO é para o cliente que o recebeu: ninguém escaneia
   a tela do próprio celular. Ele é para a segunda pessoa — o conhecido a quem
   a cliente mostra o cartão. Por isso o QR é o de indicação, e o link dos
   telefones continua no texto da mensagem, onde é tocável.

   O código identifica QUEM indicou, e viaja sozinho dentro do endereço: o
   conhecido não digita nada e não precisa lembrar do código de outra pessoa.

   Três regras da especificação, e todas moram aqui:

   1. O cartão nunca promete número. A imagem é congelada — fica anos no
      celular de quem recebeu e não há como corrigi-la. Ao lado do QR só entra
      frase permanentemente verdadeira ("Conhece alguém que precisa de
      seguro?"), nunca "ganhe 10%". Uma promoção impressa continua circulando
      depois de acabar, e aí a corretora tem uma promessa que não pode honrar.
   2. O que o QR promete é decidido DEPOIS, na página. Como ele aponta para um
      endereço da Acionar e não para um WhatsApp fixo, ligar uma campanha um
      ano depois faz todos os cartões já enviados passarem a valer, sem
      reimprimir nada.
   3. Nome de cliente não viaja. O código é opaco e a tradução código → nome
      fica só neste aparelho, nunca sobe para a internet — mesma regra pela
      qual a placa do carro saiu do link do cliente.
   ========================================================================== */

const RAIZ_INDICACAO = 'https://backes10.github.io/cartao-acionar/a/#';
const CHAVE_INDICACOES = 'acionar.indicacoes';

/* Alfabeto sem 0/O, 1/I/L e 5/S: o código é lido em voz alta e digitado à mão
 * na busca do app, e esses pares são exatamente onde se erra. Sobram 28
 * símbolos, que em 6 casas dão 481 milhões de combinações. */
const ALFABETO_CODIGO = '2346789ABCDEFGHJKMNPQRTUVWXYZ';

function lerIndicacoes() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_INDICACOES) || '{}');
    return salvo && typeof salvo === 'object' ? salvo : {};
  } catch (_) {
    return {};
  }
}

/** Chave de comparação do nome: sem acento, sem caixa, sem espaço repetido.
 *
 *  Existe para "João da Silva", "joao da silva" e "João  da Silva" receberem o
 *  MESMO código. A especificação pede isso em letra: dois cartões para a mesma
 *  cliente têm de sair com o mesmo código, senão a indicação dela se divide em
 *  dois e nenhuma das metades bate. */
function chaveDoNome(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** O código desta cliente: o que já existe, ou um novo, gravado no aparelho.
 *
 *  Sorteado e guardado, e não derivado do nome. Código derivado seria a mesma
 *  função aplicada a um conjunto pequeno de nomes brasileiros: quem tivesse o
 *  código poderia testar nomes até achar o que bate, e o nome da cliente
 *  vazaria pelo próprio código. Sorteado, ele não diz nada a quem o vê. */
function codigoDeIndicacao(nome) {
  const chave = chaveDoNome(nome);
  if (!chave) return '';
  const mapa = lerIndicacoes();
  for (const [codigo, reg] of Object.entries(mapa)) {
    if (chaveDoNome(reg && reg.nome) === chave) return codigo;
  }

  let codigo = '';
  // Sorteio criptográfico e não Math.random: o código é o que atribui a
  // indicação, e sequência previsível deixaria alguém reivindicar a de outro.
  for (let tentativa = 0; tentativa < 20 && !codigo; tentativa += 1) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const candidato = Array.from(bytes, (b) => ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]).join('');
    if (!mapa[candidato]) codigo = candidato;
  }
  if (!codigo) return '';

  mapa[codigo] = { nome: String(nome).trim(), em: new Date().toISOString().slice(0, 10) };
  try {
    localStorage.setItem(CHAVE_INDICACOES, JSON.stringify(mapa));
  } catch (_) {
    // Sem espaço para gravar, é melhor não pôr QR nenhum no cartão do que pôr
    // um código que este aparelho não vai saber traduzir depois.
    return '';
  }
  return codigo;
}

/** De quem é este código? Usado quando chega a mensagem "Vim por indicação". */
function buscarIndicacao(codigo) {
  const alvo = String(codigo || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!alvo) return null;
  const reg = lerIndicacoes()[alvo];
  return reg ? { codigo: alvo, nome: reg.nome, em: reg.em } : null;
}

/** O link é público e a página lê o `data/seguradoras.json` PUBLICADO — nunca o
 *  que o vendedor cadastrou no aparelho dele.
 *
 *  Daí três situações, e nenhuma delas dava sinal nenhum antes:
 *
 *  1. Seguradora criada pela tela. O id só existe no aparelho, a página não
 *     acha nada e o cliente lê "Não encontrei esta seguradora no cadastro".
 *     O app mostrava o endereço como se estivesse tudo certo.
 *  2. Telefone ou nome corrigidos pela tela. Pior que o caso 1, porque
 *     funciona: o cartão mostra o número novo, o link entrega o antigo, e o
 *     cliente fica com duas fontes que se contradizem. Ninguém descobre até
 *     alguém ligar para a central errada.
 *  3. Só o "já conferi" mudou. Aqui o link continua servindo, e o cliente vai
 *     ver o aviso vermelho de não conferido até eu publicar a base nova. É
 *     chato, não é perigoso — então o link vai, com o vendedor avisado.
 *
 *  Nos casos 1 e 2 o link é omitido: a mensagem sai com a imagem e o contato,
 *  que estão certos. Melhor mensagem sem link do que link mentindo.
 *
 *  Não custa requisição nenhuma: `seguradorasBase` É o arquivo publicado, já
 *  carregado na abertura. É o mesmo mecanismo do conferirCorretora(), que existe
 *  para o mesmo risco do lado dos dados da corretora. */
function divergenciaDoLink() {
  const nada = { omitir: false, aviso: '' };
  if (!estado.config.linkNaMensagem || !estado.seguradoraId) return nada;

  const base = (estado.seguradorasBase || []).find((s) => s.id === estado.seguradoraId);
  const efetiva = seguradoraAtual();
  if (!efetiva) return nada;

  if (!base) {
    return {
      omitir: true,
      aviso: `A ${efetiva.nome} existe só neste aparelho, então a página do link não a conhece `
        + 'e o cliente veria um erro. Deixei o link fora da mensagem — a imagem e o contato vão '
        + 'completos. Em Cadastrar → Backup do catálogo, exporte e me mande o arquivo para eu '
        + 'publicar; aí o link volta.'
    };
  }

  // mesmoValor e não JSON.stringify: a ordem das chaves do telefone não é dado.
  // Comparando as strings, um Salvar que não mudou nada tirava o link daqui.
  const mudou = [];
  if (!mesmoValor(efetiva.telefones, base.telefones)) mudou.push('os telefones');
  if (!mesmoValor(efetiva.nome, base.nome)) mudou.push('o nome');
  if (mudou.length) {
    return {
      omitir: true,
      aviso: `Você corrigiu ${mudou.join(' e ')} da ${efetiva.nome} neste aparelho, e a página do `
        + 'link ainda serve a versão publicada. O cliente veria dado diferente do que está na '
        + 'imagem, então deixei o link fora da mensagem. Exporte o catálogo em Cadastrar → '
        + 'Backup e me mande, que eu publico.'
    };
  }

  if (!efetiva.exemplo && base.exemplo) {
    return {
      omitir: false,
      aviso: `Você marcou a ${efetiva.nome} como conferida aqui, mas a base publicada ainda não `
        + 'sabe disso: a imagem sai limpa e a página do link vai avisar o cliente que os '
        + 'telefones não foram conferidos. Me mande o catálogo exportado para eu publicar.'
    };
  }

  return nada;
}

const estado = {
  produtos: null,
  ordemProdutos: [],
  seguradoras: [],
  // O catálogo como está publicado, sem os ajustes do aparelho. É exatamente o
  // que a página do link enxerga, e é com ele que divergenciaDoLink() compara.
  seguradorasBase: [],
  produtoId: null,
  seguradoraId: null,
  dados: {},
  whatsCliente: '',
  config: { ...CONFIG_PADRAO },
  artefatos: null,
  // Preenchido quando os dados da corretora aqui e os da página do link não
  // batem. Ver conferirCorretora().
  divergenciaCorretora: ''
};

const $ = (sel) => document.querySelector(sel);
const el = {};
// Ids que o JavaScript espera e o HTML desta versão não tem. Ver o comentário
// em iniciar(): é o sintoma de HTML e JS vindos de versões diferentes.
const elFaltando = [];

/* ==========================================================================
   Utilidades de texto e número
   ========================================================================== */

function formatarTelBR(valor) {
  const d = String(valor || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatarPlaca(valor) {
  return String(valor || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
}

function agruparMilhar(inteiro) {
  return inteiro.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatarDinheiro(valor) {
  const s = String(valor || '').trim().replace(/[R$\s]/gi, '');
  if (!s) return '';
  if (s.includes(',')) {
    const [inteiro, decimal = ''] = s.split(',');
    const i = inteiro.replace(/\D/g, '');
    if (!i && !decimal) return '';
    const d = (decimal.replace(/\D/g, '') + '00').slice(0, 2);
    return agruparMilhar(i || '0') + ',' + d;
  }
  const i = s.replace(/\D/g, '');
  return i ? agruparMilhar(i) + ',00' : '';
}

function dataParaBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '').trim();
}

function hojeBR() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Hoje no formato dos campos de data, para comparar com a vigência.
 *
 *  Montado a partir das partes locais, e não de toISOString(): aquele devolve
 *  UTC, e das 21h em diante no Brasil ele já está no dia seguinte. Uma apólice
 *  que vence hoje seria dada como vencida três horas antes da meia-noite. */
function hojeISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function primeiroNome(nomeCompleto) {
  return String(nomeCompleto || '').trim().split(/\s+/)[0] || '';
}


function aplicarTemplate(template, dados) {
  let temVariavel = false;
  let algumPreenchido = false;
  const texto = String(template || '').replace(/\{(\w+)\}/g, (_, chave) => {
    temVariavel = true;
    const valor = String(dados[chave] ?? '').trim();
    if (valor) algumPreenchido = true;
    return valor;
  });

  // Template com variável nenhuma preenchida devolve vazio, não o rótulo solto:
  // "Placa {placa}" sem placa saía como "Placa" no cartão, sem número nenhum.
  if (temVariavel && !algumPreenchido) return '';

  return texto
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[-–—•|,]+\s*$/, '')
    .trim();
}

function hexParaRgba(hex, alfa) {
  const h = String(hex || '#000000').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(n.slice(0, 6), 16) || 0;
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alfa})`;
}

/* ==========================================================================
   vCard 3.0

   As regras de discagem (0800/0300/4004 não aceitam +55), o escape e a dobra de
   linha moram em comum.js, compartilhadas com a página do link.
   ========================================================================== */

function montarVCard(cartao) {
  const linhas = [];
  const add = (linha) => linhas.push(dobrarLinha(linha));

  add('BEGIN:VCARD');
  add('VERSION:3.0');
  add('PRODID:-//Corretora Acionar//Cartao Acionar//PT-BR');

  // Sobrenome recebe o rótulo inteiro: assim o contato ordena em "S" de Seguro
  // tanto em aparelho que ordena por nome quanto por sobrenome.
  add('N:' + escVCard(cartao.nomeContato) + ';;;;');
  add('FN:' + escVCard(cartao.nomeContato));

  const org = [cartao.seguradora, estado.config.corretora].filter(Boolean).map(escVCard);
  if (org.length) add('ORG:' + org.join(';'));
  if (cartao.apolice) add('TITLE:' + escVCard('Apólice ' + cartao.apolice));

  let grupo = 0;
  for (const tel of cartao.telefones) {
    // semTel: número que o Android reescreve (4004). Fica só na imagem e nas
    // observações. Telefone errado na agenda é pior que telefone ausente.
    if (tel.semTel) continue;
    const numero = telParaDiscagem(tel.numero);
    if (!numero) continue;
    grupo += 1;
    const g = 'item' + grupo;
    const tipos = tel.movel ? 'CELL,VOICE' : 'WORK,VOICE';
    const pref = grupo === 1 ? ',PREF' : '';
    // Etiqueta dupla de propósito: X-ABLabel é o que o iPhone entende,
    // TYPE é o que o Android usa quando ignora o X-ABLabel.
    add(`${g}.TEL;TYPE=${tipos}${pref}:${numero}`);
    add(`${g}.X-ABLabel:${escVCard(tel.rotuloAgenda || tel.rotulo)}`);
  }

  for (const url of cartao.urls) {
    if (!url.valor) continue;
    grupo += 1;
    add(`item${grupo}.URL:${escVCard(url.valor)}`);
    add(`item${grupo}.X-ABLabel:${escVCard(url.rotulo)}`);
  }

  // E-mail por último: é o item menos urgente num sinistro. A tela "Mostrar
  // contato" do WhatsApp reordena tudo por conta própria (separa o que ela
  // reconhece como conta WhatsApp), mas a agenda do celular respeita a ordem
  // do arquivo — e é na agenda que o cliente vai procurar.
  for (const email of cartao.emails) {
    if (!email.valor) continue;
    grupo += 1;
    add(`item${grupo}.EMAIL;TYPE=INTERNET:${escVCard(email.valor)}`);
    add(`item${grupo}.X-ABLabel:${escVCard(email.rotulo)}`);
  }

  add('NOTE:' + escVCard(cartao.observacoes));
  // Em CATEGORIES a vírgula é separador de lista, então vai crua. A categoria
  // acompanha o produto: estava fixa em "Seguros" e marcava a cota de consórcio
  // como se fosse seguro — o mesmo erro de vocabulário do "Seguro Consórcio".
  add('CATEGORIES:' + escVCard(cartao.categoria || 'Seguros') + ',Acionar');

  if (cartao.foto) {
    add(`PHOTO;ENCODING=b;TYPE=${cartao.foto.tipo}:` + cartao.foto.base64);
  }

  add('REV:' + new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
  add('END:VCARD');

  return linhas.join('\r\n') + '\r\n';
}

/* ==========================================================================
   Montagem do cartão a partir do formulário
   ========================================================================== */

function produtoAtual() {
  return estado.produtos ? estado.produtos[estado.produtoId] : null;
}

function seguradoraAtual() {
  return estado.seguradoras.find((s) => s.id === estado.seguradoraId) || null;
}

/* ==========================================================================
   Catálogo de seguradoras editável

   Os ajustes do vendedor ficam no aparelho SOBREPOSTOS ao catálogo que vem no
   projeto, não substituindo ele. Assim eu continuo podendo publicar correções
   na base (uma seguradora nova, um telefone que mudou) sem apagar o trabalho
   dele — e o que ele editou continua vencendo.
   ========================================================================== */

function lerAjustesCatalogo() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_CATALOGO) || '{}');
    return {
      editadas: salvo.editadas || {},
      novas: Array.isArray(salvo.novas) ? salvo.novas : [],
      removidas: Array.isArray(salvo.removidas) ? salvo.removidas : []
    };
  } catch (_) {
    return { editadas: {}, novas: [], removidas: [] };
  }
}

function salvarAjustesCatalogo(ajustes) {
  try {
    localStorage.setItem(CHAVE_CATALOGO, JSON.stringify(ajustes));
    return true;
  } catch (_) {
    statusEnvio('Não consegui salvar o catálogo — algum logo pode estar grande demais.', 'erro');
    return false;
  }
}

/** Junta a base do projeto com os ajustes locais. */
function catalogoEfetivo() {
  const ajustes = lerAjustesCatalogo();
  const lista = [];
  for (const base of estado.seguradorasBase) {
    if (ajustes.removidas.includes(base.id)) continue;
    lista.push(ajustes.editadas[base.id] ? juntar(base, ajustes.editadas[base.id]) : base);
  }
  for (const nova of ajustes.novas) {
    if (!ajustes.removidas.includes(nova.id)) lista.push(limparNulos(nova));
  }
  return lista;
}

/** Junta a base com o ajuste local. `null` no ajuste significa APAGADO.
 *
 *  Precisa de um valor explícito porque o JSON.stringify descarta chave com
 *  `undefined`: gravando `logo: undefined`, a remoção do logo simplesmente não
 *  chegava ao disco e ele reaparecia na recarga seguinte. */
function juntar(base, ajuste) {
  return limparNulos({ ...base, ...ajuste });
}

function limparNulos(obj) {
  const saida = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) saida[k] = v;
  }
  return saida;
}

/** Dois valores são o MESMO DADO?
 *
 *  Existe porque o JSON.stringify não serve para isso, e usá-lo custou caro. Ele
 *  compara a forma escrita, não o conteúdo: `{rotulo, numero}` e
 *  `{numero, rotulo}` são o mesmo telefone e geram strings diferentes.
 *
 *  O catálogo do projeto grava o telefone como `{rotulo, rotuloCurto, numero,
 *  tipo}`; o editor o remonta como `{rotulo, numero, tipo, rotuloCurto}`. Com o
 *  stringify, abrir uma seguradora e tocar em Salvar SEM MUDAR NADA marcava os
 *  telefones como alterados — em 20 das 22 entradas. E aí dois estragos, os dois
 *  calados: a entrada ficava imune às correções publicadas (o mesmo bug que o
 *  soAsDiferencas existe para evitar, entrando pela porta do lado) e o
 *  divergenciaDoLink tirava o link da mensagem acusando o vendedor de uma
 *  correção que ele não fez.
 *
 *  Vazio é vazio: '', null e ausente são a mesma coisa aqui. O editor normaliza
 *  campo em branco para null, e o catálogo tem oito entradas com `"site": ""` e
 *  três com `"logo": ""` — comparadas como strings, todas divergiam. */
function mesmoValor(a, b) {
  const vazio = (v) => v === null || v === undefined || v === '';
  if (a === b) return true;
  if (vazio(a) || vazio(b)) return vazio(a) && vazio(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b)
      && a.length === b.length
      && a.every((x, i) => mesmoValor(x, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    // Chave com valor vazio não conta: gravar `rotuloCurto: ''` ou omitir a
    // chave dizem a mesma coisa, e o editor faz um, o catálogo faz o outro.
    const chaves = (o) => Object.keys(o).filter((k) => !vazio(o[k]));
    const ka = chaves(a);
    const kb = chaves(b);
    return ka.length === kb.length && ka.every((k) => mesmoValor(a[k], b[k]));
  }
  return false;
}

/** Guarda só o que difere da base do projeto.
 *
 *  Antes o ajuste local guardava o registro inteiro, e isso tinha um efeito
 *  silencioso: uma seguradora editada uma vez ficava imune para sempre às
 *  correções publicadas. Se eu corrigisse um telefone da Yelum no projeto, a
 *  cópia local continuaria por cima, sem aviso. Guardando só a diferença, o que
 *  ele não tocou continua vindo do projeto e recebe correção. */
function soAsDiferencas(cia, base) {
  if (!base) return cia;
  const delta = { id: cia.id };
  for (const chave of ['nome', 'exemplo', 'logo', 'site', 'produtos', 'telefones']) {
    if (!mesmoValor(cia[chave], base[chave])) delta[chave] = cia[chave] ?? null;
  }
  return delta;
}

/** O catálogo já filtrado pelo produto ativo.
 *
 *  Administradora de consórcio não é seguradora. São pessoas jurídicas
 *  distintas, com CNPJ e telefones próprios, mesmo quando o nome coincide —
 *  Porto Seguro Administradora de Consórcios não é a Porto Seguro Companhia de
 *  Seguros Gerais. Sem este filtro a Yelum apareceria como opção de consórcio e
 *  o vendedor mandaria ao cliente o telefone de reboque de uma seguradora que
 *  não tem nada a ver com a cota dele.
 *
 *  Entrada sem `produtos` aparece em todos. É o caso do que o vendedor cadastra
 *  pelo editor: sumir da lista por falta de um campo que ele nunca viu seria
 *  pior que aparecer a mais. */
function catalogoDoProduto(produtoId) {
  const alvo = produtoId || estado.produtoId;
  return estado.seguradoras.filter((s) => !s.produtos || s.produtos.includes(alvo));
}

function recarregarCatalogo() {
  const anterior = estado.seguradoraId;
  estado.seguradoras = catalogoEfetivo();
  if (anterior && !catalogoDoProduto().some((s) => s.id === anterior)) estado.seguradoraId = null;
  renderSeguradoras();
  renderTelefonesSeguradora();
  renderAvisoExemplo();
  atualizar();
}

function idNovaSeguradora(nome) {
  const base = nomeArquivoSeguro(nome).toLowerCase() || 'seguradora';
  let id = base;
  let n = 2;
  while (estado.seguradoras.some((s) => s.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

function templateDoProduto(produtoId) {
  const salvo = estado.config.templates && estado.config.templates[produtoId];
  const padrao = estado.produtos?.[produtoId]?.templateNome || '';
  return salvo || padrao;
}

/** "Seguro Auto", "Seguro de Vida" — o pedaço literal do template, antes da
 *  primeira variável. Antes eu montava isso do eyebrow, que é caixa alta, e a
 *  mensagem saía "Seu Seguro AUTO — Nissan Kait". Respeita template alterado. */
function rotuloProduto(produtoId) {
  const prefixo = String(templateDoProduto(produtoId)).split('{')[0]
    .replace(/[\s\-–—•|,]+$/, '')
    .trim();
  return prefixo || (estado.produtos?.[produtoId]?.nome || 'Seguro');
}

function vigenciaTexto(dados) {
  const ini = dataParaBR(dados.vigenciaInicio);
  const fim = dataParaBR(dados.vigenciaFim);
  if (ini && fim) return `${ini} a ${fim}`;
  return ini || fim || '';
}

function valorDetalhe(detalhe, dados) {
  const bruto = detalhe.campo === '@vigencia' ? vigenciaTexto(dados) : String(dados[detalhe.campo] ?? '').trim();
  if (!bruto) return '';
  return (detalhe.prefixo || '') + bruto;
}

function montarCartao() {
  const produto = produtoAtual();
  const seguradora = seguradoraAtual();
  if (!produto) return null;

  const dados = estado.dados;
  const cfg = estado.config;

  // O reserva usa o vocabulário do próprio produto. Estava fixo em "Seguro " +
  // nome, e no consórcio — que não é seguro — saía "Seguro Consórcio" na tela
  // que mostra o nome que vai para a agenda do cliente.
  const nomeContato = aplicarTemplate(templateDoProduto(estado.produtoId), dados)
    || (produto.rotuloResumo ? produto.nome : 'Seguro ' + produto.nome);
  const titulo = aplicarTemplate(produto.tituloCartao, dados);
  const subtitulo = aplicarTemplate(produto.subtituloCartao, dados);

  const telefones = [];
  const doSeguro = ordenarTelefones(seguradora?.telefones);
  for (const t of doSeguro) {
    telefones.push({
      // Dois rótulos de propósito: o completo vai na imagem, que tem espaço e
      // cabeçalho; o curto, prefixado com a seguradora, vai no contato da
      // agenda, onde rótulo longo aparece cortado no meio da palavra.
      rotulo: t.rotulo,
      rotuloAgenda: `${seguradora.nome} ${t.rotuloCurto || t.rotulo}`,
      numero: t.numero,
      // Marcado como WhatsApp E capaz de ser um. O catálogo tem 0800 com
      // `tipo: whatsapp` — raspagem que errou o rótulo — e só o tipo bastava
      // para o contato sair com TYPE=CELL, pondo ícone de celular num número
      // gratuito na agenda do cliente. O telParaWaMe já sabe o que não existe
      // no WhatsApp; aqui é a mesma regra, reaproveitada.
      movel: t.tipo === 'whatsapp' && !!telParaWaMe(t.numero),
      // Fica na imagem e nas observações, mas não vira telefone clicável.
      semTel: !!t.semTel,
      grupo: 'seguradora'
    });
  }
  // Mesmo padrão dos da seguradora: marca na frente, rótulo curto. Assim a
  // agenda do cliente lê "Yelum Demais Regiões" / "Acionar WhatsApp" e não
  // uma lista de frases cortadas.
  const marcaCorretora = cfg.corretor ? primeiroNome(cfg.corretor) : 'Acionar';
  if (cfg.whatsapp) {
    telefones.push({
      rotulo: `WhatsApp ${marcaCorretora}`,
      rotuloAgenda: `Acionar WhatsApp${cfg.corretor ? ' (' + marcaCorretora + ')' : ''}`,
      // No rodapé do cartão o nome da corretora está na linha de cima: repetir
      // "Acionar" aqui só rouba espaço de uma faixa que já é apertada.
      rotuloRodape: 'WhatsApp',
      numero: cfg.whatsapp,
      movel: true,
      grupo: 'corretor'
    });
  }
  if (cfg.telefone) {
    telefones.push({
      rotulo: 'Acionar — escritório (horário comercial)',
      rotuloAgenda: 'Acionar Escritório',
      rotuloRodape: 'Escritório',
      numero: cfg.telefone,
      movel: false,
      grupo: 'corretor'
    });
  }

  // O link wa.me saiu: era o mesmo número do WhatsApp que já está na lista, e
  // aparecia na agenda como um item "Outro" com uma URL crua.
  const urls = [];
  if (cfg.site) urls.push({ rotulo: 'Acionar Site', valor: cfg.site });
  if (seguradora?.site) urls.push({ rotulo: `${seguradora.nome} Site`, valor: seguradora.site });

  const emails = [];
  if (cfg.email) emails.push({ rotulo: 'Acionar E-mail', valor: cfg.email });

  const detalhes = (produto.detalhes || [])
    .map((d) => ({ label: d.label, valor: valorDetalhe(d, dados) }))
    .filter((d) => d.valor);

  const extras = String(dados.extras || '').split('\n').map((s) => s.trim()).filter(Boolean);

  const ehExemplo = !!seguradora?.exemplo;

  const cartao = {
    produtoId: estado.produtoId,
    // Templatizado: no consórcio o eyebrow depende do tipo do bem escolhido
    // ("CONSÓRCIO IMÓVEL", "CONSÓRCIO AUTO"). Nos seguros é texto literal e o
    // aplicarTemplate devolve ele mesmo.
    eyebrow: (aplicarTemplate(produto.eyebrow, dados) || produto.eyebrow).toUpperCase(),
    // Consórcio não tem sinistro. Sem isto o cartão de uma cota de imóvel saía
    // com "EM CASO DE SINISTRO OU REBOQUE" em cima do telefone da
    // administradora, e a mensagem mandava o cliente ligar depois de bater o
    // carro que a cota não cobre.
    // Ícone ao lado do título, escolhido por um campo do formulário. Sai na cor
    // de destaque e some quando o campo não foi preenchido — melhor sem ícone
    // que com o ícone errado.
    //
    //  Dois caminhos: o consórcio escolhe pelo tipo do bem preenchido no
    //  formulário; os seguros têm um ícone fixo, porque o próprio produto já
    //  diz o que é. Quando o tipo ainda não foi escolhido, cai no fixo — e se
    //  não houver nenhum, o cartão sai sem ícone.
    iconeTitulo: (() => {
      const m = produto.iconePorTipo;
      const porTipo = m && m.valores[String(dados[m.campo] || '').trim()];
      const id = porTipo || produto.iconeCartao;
      return id && icones[id] ? id : null;
    })(),
    categoria: produto.rotuloResumo || 'Seguros',
    // O cartão é um resumo digitado à mão a partir de outro documento. Se o
    // vendedor errar uma cobertura ou uma data, quem manda é o documento — e o
    // cliente precisa saber disso ANTES de precisar. Consórcio não tem apólice,
    // tem contrato, então a palavra vem do produto.
    ressalva: 'Resumo informativo. Em caso de divergência, vale o que consta '
      + (produto.documento || 'na apólice') + '.',
    tituloTelefones: produto.tituloTelefones || 'EM CASO DE SINISTRO OU REBOQUE',
    instrucaoAgenda: produto.instrucaoAgenda
      || 'Salve na sua agenda: em caso de sinistro ou reboque, procure por "Seguro" no telefone e ligue direto — todos os números já estão lá.',
    nomeContato,
    titulo,
    subtitulo,
    segurado: String(dados.segurado || '').trim(),
    seguradora: seguradora?.nome || '',
    logoSeguradora: seguradora?.logo || '',
    apolice: String(dados.apolice || '').trim(),
    detalhes,
    telefones,
    urls,
    emails,
    extras,
    ehExemplo,
    // Código de indicação desta cliente, emitido na primeira vez e reaproveitado
    // depois. Sem nome preenchido não há a quem atribuir a indicação, e aí o
    // cartão sai sem QR — melhor sem QR do que com um que não conta para
    // ninguém. Ver codigoDeIndicacao().
    codigoIndicacao: codigoDeIndicacao(dados.segurado),
    foto: null
  };

  cartao.observacoes = montarObservacoes(cartao, produto, dados);
  return cartao;
}

function montarObservacoes(cartao, produto, dados) {
  const l = [];
  if (cartao.ehExemplo) {
    // "Não conferidos" e não "fictícios": a maioria destes números é real,
    // tirada do site da própria empresa — o que falta é alguém ter ligado para
    // confirmar a que finalidade cada um atende. Aviso que exagera vira aviso
    // ignorado, e este é o único que separa o cliente de um telefone errado.
    l.push('*** CARTÃO DE EXEMPLO — TELEFONES NÃO CONFERIDOS, NÃO USE ***', '');
  }
  if (cartao.segurado) l.push((produto.rotuloTitular || 'SEGURADO').toUpperCase() + ': ' + cartao.segurado);
  const resumo = aplicarTemplate(produto.resumoCurto, dados);
  if (resumo) l.push((produto.rotuloResumo || 'SEGURO').toUpperCase() + ': ' + resumo);
  if (cartao.seguradora) {
    l.push((produto.rotuloFornecedor || 'SEGURADORA').toUpperCase() + ': ' + cartao.seguradora);
  }
  for (const d of cartao.detalhes) l.push(d.label.toUpperCase() + ': ' + d.valor);

  if (cartao.extras.length) {
    l.push('', 'COBERTURAS');
    for (const e of cartao.extras) l.push('- ' + e);
  }

  if (cartao.telefones.length) {
    l.push('', 'TELEFONES');
    for (const t of cartao.telefones) {
      // O número que não virou telefone clicável tem de aparecer aqui, senão
      // desaparece do contato — e ele é o preferido da seguradora na capital.
      const marca = t.semTel ? ' (digite à mão)' : '';
      l.push(`- ${t.rotuloAgenda || t.rotulo}: ${t.numero}${marca}`);
    }
  }

  for (const e of cartao.emails) l.push('', 'E-MAIL: ' + e.valor);

  l.push('', `Cartão emitido por ${estado.config.corretora || 'Corretora Acionar'} em ${hojeBR()}.`);
  return l.join('\n');
}

/** A mensagem que acompanha o cartão.
 *
 *  Curta de propósito. A versão anterior repetia o produto, o veículo, a
 *  seguradora e o nome do contato — tudo isso já está escrito na imagem que vai
 *  junto, e quem recebe as duas coisas lê duas vezes a mesma informação. Aqui
 *  fica só o que a imagem não faz: o link, que é tocável. */
/** Três linhas. Nada mais.
 *
 *  A do meio existe para ser ACHADA: meses depois, o cliente vai procurar
 *  "Yelum" ou "seguro auto" na busca do WhatsApp, e é esta mensagem que tem de
 *  aparecer. Por isso ela junta o nome da seguradora com o do produto, mesmo
 *  parecendo telegráfica — quem lê no momento do envio já está vendo a imagem
 *  logo acima, com tudo escrito por extenso.
 *
 *  Assinatura não entra: o nome e os telefones do corretor estão no rodapé
 *  daquela mesma imagem. */
function mensagemWhatsApp(cartao) {
  const nome = primeiroNome(cartao.segurado);
  const l = [];
  l.push(nome ? `Olá, ${nome}!` : 'Olá!');

  const produto = rotuloProduto(cartao.produtoId);
  // "Porto Seguro Consórcio" + "Consórcio" sairia com a palavra repetida.
  const repete = produto && cartao.seguradora
    && cartao.seguradora.toLowerCase().includes(produto.toLowerCase());
  const busca = ['Telefones', cartao.seguradora, repete ? '' : produto]
    .filter(Boolean).join(' ');

  const link = linkDoCartao();
  if (link) {
    l.push(busca);
    l.push(link);
  } else {
    // Sem link, a única coisa que a imagem não resolve sozinha é o contato.
    l.push(cartao.instrucaoAgenda);
  }
  return l.join('\n');
}

/** Separa o que IMPEDE de gerar do que é só recomendação.
 *
 *  Antes tudo virava um aviso e nada bloqueava: dava para baixar um cartão sem
 *  seguradora e sem veículo, com nome genérico "Seguro Auto" e nenhum telefone
 *  de sinistro. Cartão assim na mão do cliente é pior que cartão nenhum, porque
 *  ele acha que está protegido. */
function conferirCartao() {
  const produto = produtoAtual();
  if (!produto) return { impedimentos: ['Escolha um produto.'], avisos: [] };

  const impedimentos = [];
  const faltando = produto.campos
    .filter((c) => c.obrigatorio && !String(estado.dados[c.id] || '').trim())
    .map((c) => c.label);
  if (faltando.length) impedimentos.push('Preencha: ' + faltando.join(', ') + '.');
  if (!seguradoraAtual()) {
    impedimentos.push(produto.avisoSemFornecedor
      || 'Escolha a seguradora — sem ela o cartão vai sem telefone de sinistro.');
  }

  // Vigência invertida ou de um dia só é erro de digitação, não de cadastro:
  // apareceu num cartão real como "08/08/2026 a 08/08/2026". Impede, porque um
  // cartão dizendo que o seguro venceu no dia em que começou é pior que nenhum.
  const ini = estado.dados.vigenciaInicio;
  const fim = estado.dados.vigenciaFim;
  if (ini && fim && fim <= ini) {
    impedimentos.push(fim === ini
      ? 'A vigência começa e termina no mesmo dia. Confira as datas.'
      : 'A vigência termina antes de começar. Confira as datas.');
  }

  // Vigência que já passou é da mesma família das duas de cima, e é a mais
  // provável de todas: o Histórico existe justamente para recarregar um cartão e
  // trocar só a vigência. Esquecer de trocar é o erro mais fácil de cometer
  // aqui, e o resultado é um cartão afirmando ao cliente que ele está coberto
  // por um seguro que terminou. Impede, como as outras.
  //
  // O `<` e não `<=`: apólice que vence hoje vale hoje.
  if (fim && fim < hojeISO()) {
    impedimentos.push(`A vigência terminou em ${dataParaBR(fim)}. `
      + 'Se é uma renovação, troque as duas datas antes de enviar.');
  }

  const avisos = [];
  // Primeiro da lista de propósito. A proteção do EXEMPLO existia em três
  // lugares — marca d'água na imagem, prefixo no nome do arquivo, "NÃO USE" nas
  // observações do contato — e em nenhum deles na TELA de quem está montando o
  // cartão. Dava para escolher uma seguradora não conferida, ver a prévia e
  // enviar sem que uma linha do app dissesse por que aquele cartão está riscado.
  //
  // É aviso e não impedimento porque testar com exemplo é uso legítimo: quem
  // está conferindo os números precisa gerar o cartão para conferir. O que não
  // pode é o silêncio.
  const cia = seguradoraAtual();
  if (cia?.exemplo) {
    avisos.push(`Os telefones da ${cia.nome} ainda não foram conferidos. A imagem sai riscada `
      + 'com EXEMPLO e a página do link avisa o cliente para não discar. Antes de mandar para '
      + 'cliente de verdade, ligue em cada número e marque "Já liguei em todos estes números" '
      + 'no cadastro.');
  }
  // O catálogo daqui contra o catálogo publicado. Mesmo risco do
  // divergenciaCorretora abaixo, do outro lado dos dados.
  const doLink = divergenciaDoLink();
  if (doLink.aviso) avisos.push(doLink.aviso);
  if (estado.divergenciaCorretora) {
    avisos.push('Os dados da corretora na página do link estão diferentes dos daqui ('
      + estado.divergenciaCorretora + '). O cliente que abrir o link vai ver os antigos — me avise para eu publicar a correção.');
  }
  if (!estado.config.whatsapp) avisos.push('Cadastre o WhatsApp do corretor em Configurações — sem ele o cliente não tem como te achar.');
  if (!estado.config.logo) avisos.push('Suba o logo da Acionar em Configurações para o cartão sair com a marca.');
  if (fotoRecusada) avisos.push('O logo entrou na imagem, mas ficou grande demais para virar a foto do contato. Use um PNG mais simples, de traço, se quiser a marca na agenda também.');

  return { impedimentos, avisos };
}

// Ligado quando há logo mas ele não caberia como foto do vCard.
let fotoRecusada = false;

/* ==========================================================================
   Desenho do cartão (canvas puro — previsível no Safari e no Chrome)
   ========================================================================== */

const FONTE = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
const fnt = (peso, tam) => `${peso} ${tam}px ${FONTE}`;
const LARGURA = 1080;
const PAD = 76;
const ALTURA_MAX = 2600;
// Altura máxima que o balão do WhatsApp mostra sem cortar, em múltiplos da
// largura. Acima disso ele exibe só o miolo da imagem.
const PROPORCAO_MAX = 1.25;

// Map, não uma vaga só: o cartão carrega o logo da Acionar E o da seguradora.
// Com cache de uma posição os dois se expulsavam a cada desenho.
const cacheLogo = new Map();

function carregarLogo(fonte) {
  if (!fonte) return Promise.resolve(null);
  if (cacheLogo.has(fonte)) return Promise.resolve(cacheLogo.get(fonte));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { cacheLogo.set(fonte, img); resolve(img); };
    img.onerror = () => { cacheLogo.set(fonte, null); resolve(null); };
    img.src = fonte;
  });
}

function retanguloArredondado(ctx, x, y, w, h, r) {
  const raio = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + raio, y);
  ctx.arcTo(x + w, y, x + w, y + h, raio);
  ctx.arcTo(x + w, y + h, x, y + h, raio);
  ctx.arcTo(x, y + h, x, y, raio);
  ctx.arcTo(x, y, x + w, y, raio);
  ctx.closePath();
}

function quebrarTexto(ctx, texto, larguraMax) {
  const palavras = String(texto || '').split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? atual + ' ' + p : p;
    if (ctx.measureText(teste).width > larguraMax && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Espaçamento entre letras desenhando caractere por caractere:
 *  ctx.letterSpacing não existe no Safari mais antigo. */
function textoEspacado(ctx, texto, x, y, espaco) {
  let cursor = x;
  for (const ch of String(texto)) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + espaco;
  }
  return cursor - espaco - x;
}

/* ==========================================================================
   Ícones dos serviços da corretora
   ========================================================================== */

/** Cada ícone é desenhado no próprio canvas, em coordenadas de 0 a 1 dentro de
 *  uma caixa lado×lado a partir de (x, y).
 *
 *  Não são emoji de propósito. Emoji tem desenho próprio em cada sistema: o
 *  mesmo cartão sairia com um carrinho azul no iPhone e um cinza no Android,
 *  conforme o celular de quem gerou. Traço desenhado à mão sai igual em todo
 *  lugar e acompanha a cor da marca. */
const icones = {
  auto(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(...p(0.10, 0.56));
    ctx.lineTo(...p(0.24, 0.28));
    ctx.lineTo(...p(0.76, 0.28));
    ctx.lineTo(...p(0.90, 0.56));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...p(0.08, 0.56));
    ctx.lineTo(...p(0.92, 0.56));
    ctx.lineTo(...p(0.92, 0.74));
    ctx.lineTo(...p(0.08, 0.74));
    ctx.closePath();
    ctx.stroke();
    for (const cx of [0.28, 0.72]) {
      ctx.beginPath();
      ctx.arc(...p(cx, 0.78), 0.09 * p.lado, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  residencial(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(...p(0.08, 0.50));
    ctx.lineTo(...p(0.50, 0.16));
    ctx.lineTo(...p(0.92, 0.50));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...p(0.20, 0.46));
    ctx.lineTo(...p(0.20, 0.86));
    ctx.lineTo(...p(0.80, 0.86));
    ctx.lineTo(...p(0.80, 0.46));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...p(0.42, 0.86));
    ctx.lineTo(...p(0.42, 0.62));
    ctx.lineTo(...p(0.58, 0.62));
    ctx.lineTo(...p(0.58, 0.86));
    ctx.stroke();
  },

  vida(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(...p(0.50, 0.84));
    ctx.bezierCurveTo(...p(0.16, 0.62), ...p(0.08, 0.44), ...p(0.10, 0.34));
    ctx.bezierCurveTo(...p(0.13, 0.18), ...p(0.36, 0.14), ...p(0.50, 0.32));
    ctx.bezierCurveTo(...p(0.64, 0.14), ...p(0.87, 0.18), ...p(0.90, 0.34));
    ctx.bezierCurveTo(...p(0.92, 0.44), ...p(0.84, 0.62), ...p(0.50, 0.84));
    ctx.closePath();
    ctx.stroke();
  },

  bike(ctx, p) {
    for (const cx of [0.22, 0.78]) {
      ctx.beginPath();
      ctx.arc(...p(cx, 0.68), 0.20 * p.lado, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(...p(0.22, 0.68));
    ctx.lineTo(...p(0.44, 0.68));
    ctx.lineTo(...p(0.60, 0.38));
    ctx.lineTo(...p(0.78, 0.68));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...p(0.44, 0.68));
    ctx.lineTo(...p(0.54, 0.38));
    ctx.lineTo(...p(0.70, 0.38));
    ctx.stroke();
  },

  licitacao(ctx, p) {
    // martelo de leilão: cabo na diagonal, cabeça atravessada, base embaixo
    ctx.beginPath();
    ctx.moveTo(...p(0.24, 0.76));
    ctx.lineTo(...p(0.58, 0.42));
    ctx.stroke();
    ctx.save();
    ctx.lineWidth = p.lado * 0.20;
    ctx.beginPath();
    ctx.moveTo(...p(0.54, 0.20));
    ctx.lineTo(...p(0.84, 0.50));
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(...p(0.10, 0.90));
    ctx.lineTo(...p(0.54, 0.90));
    ctx.stroke();
  },

  consorcio(ctx, p) {
    // Chave. Com um dente só ela virava lupa: anel mais cabo diagonal é
    // exatamente o ícone de busca. São dois dentes, e bem destacados.
    ctx.beginPath();
    ctx.arc(...p(0.27, 0.29), 0.19 * p.lado, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...p(0.40, 0.42));
    ctx.lineTo(...p(0.86, 0.88));
    ctx.moveTo(...p(0.64, 0.66));
    ctx.lineTo(...p(0.52, 0.78));
    ctx.moveTo(...p(0.75, 0.77));
    ctx.lineTo(...p(0.63, 0.89));
    ctx.stroke();
  },

  saude(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(...p(0.50, 0.14));
    ctx.lineTo(...p(0.50, 0.86));
    ctx.moveTo(...p(0.14, 0.50));
    ctx.lineTo(...p(0.86, 0.50));
    ctx.stroke();
  },

  moto(ctx, p) {
    for (const cx of [0.19, 0.81]) {
      ctx.beginPath();
      ctx.arc(...p(cx, 0.70), 0.17 * p.lado, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(...p(0.19, 0.70));
    ctx.lineTo(...p(0.36, 0.50));
    ctx.lineTo(...p(0.60, 0.50));
    ctx.lineTo(...p(0.81, 0.70));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...p(0.28, 0.44));
    ctx.lineTo(...p(0.50, 0.44));
    ctx.moveTo(...p(0.66, 0.36));
    ctx.lineTo(...p(0.84, 0.36));
    ctx.stroke();
  },

  caminhao(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(...p(0.06, 0.30));
    ctx.lineTo(...p(0.56, 0.30));
    ctx.lineTo(...p(0.56, 0.68));
    ctx.lineTo(...p(0.06, 0.68));
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...p(0.56, 0.44));
    ctx.lineTo(...p(0.76, 0.44));
    ctx.lineTo(...p(0.92, 0.58));
    ctx.lineTo(...p(0.92, 0.68));
    ctx.lineTo(...p(0.56, 0.68));
    ctx.stroke();
    for (const cx of [0.26, 0.78]) {
      ctx.beginPath();
      ctx.arc(...p(cx, 0.76), 0.09 * p.lado, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  empresarial(ctx, p) {
    // Fachada de loja: toldo, corpo e porta. O prédio genérico ficava igual ao
    // ícone de imóvel, e os dois produtos existem no mesmo app.
    ctx.beginPath();
    ctx.moveTo(...p(0.06, 0.38));
    ctx.lineTo(...p(0.18, 0.18));
    ctx.lineTo(...p(0.82, 0.18));
    ctx.lineTo(...p(0.94, 0.38));
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...p(0.14, 0.38));
    ctx.lineTo(...p(0.14, 0.86));
    ctx.lineTo(...p(0.86, 0.86));
    ctx.lineTo(...p(0.86, 0.38));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...p(0.38, 0.86));
    ctx.lineTo(...p(0.38, 0.58));
    ctx.lineTo(...p(0.62, 0.58));
    ctx.lineTo(...p(0.62, 0.86));
    ctx.stroke();
  },

  servicos(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(...p(0.38, 0.30));
    ctx.lineTo(...p(0.38, 0.20));
    ctx.lineTo(...p(0.62, 0.20));
    ctx.lineTo(...p(0.62, 0.30));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...p(0.10, 0.30));
    ctx.lineTo(...p(0.90, 0.30));
    ctx.lineTo(...p(0.90, 0.82));
    ctx.lineTo(...p(0.10, 0.82));
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...p(0.10, 0.54));
    ctx.lineTo(...p(0.90, 0.54));
    ctx.stroke();
  }
};

/** Serviços divulgados no rodapé do cartão.
 *
 *  A ordem é a da peça que a corretora já usa. `curto` é o que cabe embaixo do
 *  ícone: sete rótulos dividem a largura do cartão, então "Seguro Residencial"
 *  não entra — vira "Residencial". */
const SERVICOS = [
  { id: 'auto', curto: 'Auto' },
  { id: 'residencial', curto: 'Residencial' },
  { id: 'vida', curto: 'Vida' },
  { id: 'bike', curto: 'Bike' },
  { id: 'licitacao', curto: 'Licitação' },
  { id: 'consorcio', curto: 'Consórcio' },
  { id: 'saude', curto: 'Saúde' }
];

/** O convite de indicação: a frase, o QR e a instrução, na coluna da direita.
 *
 *  Devolve o `y` onde o bloco termina, para quem chamou empurrar o rodapé se
 *  ele passar do último telefone.
 *
 *  Nível de correção M e não Q: os dois cabem, mas o Q empurra o código para a
 *  versão 5 (37 módulos contra 33) e, num quadrado de tamanho fixo, mais
 *  módulos significa cada um menor. Lido da tela de um celular pela câmera de
 *  outro, o que trava a leitura é módulo pequeno, não falta de correção. */
function desenharConviteIndicacao(ctx, codigo, yTopo, cores) {
  // 287 = 41 módulos × 7 pixels, e os 41 são os 33 do código mais os 4 de zona
  // de silêncio de cada lado. Casar a caixa com um múltiplo exato importa: o
  // desenharQR arredonda o passo para baixo, então uma caixa de 280 daria o
  // mesmo passo 6 de uma de 246 e jogaria fora 34 pixels de largura útil.
  //
  // Tamanho é o que decide se este QR é lido. Ele é escaneado da TELA de um
  // celular pela câmera de outro, e o que trava esse tipo de leitura é módulo
  // pequeno. A primeira versão punha a frase em cima do código numa coluna de
  // 300, e sobrava tão pouco que o código saía com 132 pixels. Com a frase ao
  // LADO, o código fica com 231 — 75% maior, na mesma altura de bloco.
  const LADO_QR = 287;
  const xQR = LARGURA - PAD - LADO_QR;
  const RESPIRO = 26;

  let qr;
  try {
    qr = gerarQR(RAIZ_INDICACAO + codigo, 'M');
  } catch (_) {
    // Sem QR o cartão sai como sempre saiu. Um cartão sem convite é muito
    // melhor que um cartão que não é gerado.
    return yTopo;
  }

  desenharQR(ctx, qr, xQR, yTopo, LADO_QR, cores.tinta, '#FFFFFF');

  /* A frase à esquerda do código, alinhada à direita para encostar nele.
   *
   * Ela é permanentemente verdadeira de propósito. A imagem do cartão é
   * congelada: fica anos no celular de quem recebeu e não há como corrigi-la.
   * Promessa de campanha ("indique e ganhe 10%") continuaria circulando depois
   * da campanha acabar. O que muda com o tempo mora na página, que se
   * atualiza. */
  ctx.save();
  ctx.textAlign = 'right';
  const direita = xQR - RESPIRO;
  const larguraTexto = direita - (PAD + 380);

  ctx.font = fnt(600, 23);
  const linhas = quebrarTexto(ctx, 'Conhece alguém que precisa de seguro?', larguraTexto);
  const ALTURA_LINHA = 30;
  // Centralizado contra o código, não alinhado pelo topo: o bloco de texto tem
  // duas ou três linhas conforme a quebra, e alinhar pelo topo deixava a frase
  // pendurada no alto de um quadrado de 287.
  let y = yTopo + (LADO_QR - (linhas.length * ALTURA_LINHA + 26)) / 2 + 20;
  ctx.fillStyle = cores.tinta;
  for (const linha of linhas) {
    ctx.fillText(linha, direita, y);
    y += ALTURA_LINHA;
  }

  // textoEspacado desenha caractere a caractere a partir do x, então precisa de
  // alinhamento à esquerda e do x já calculado: com textAlign 'right' cada
  // letra sairia alinhada por ela mesma e a palavra ficava embaralhada.
  y += 8;
  ctx.fillStyle = cores.tintaFraca;
  ctx.font = fnt(700, 18);
  ctx.textAlign = 'left';
  const ESPACO = 1.6;
  const rotulo = 'APONTE A CÂMERA';
  let largura = -ESPACO;
  for (const ch of rotulo) largura += ctx.measureText(ch).width + ESPACO;
  textoEspacado(ctx, rotulo, direita - largura, y, ESPACO);

  ctx.restore();
  return yTopo + LADO_QR;
}

async function desenharCartao(cartao) {
  const cfg = estado.config;
  const marca = cfg.cor1 || '#0E3A5E';
  const destaque = cfg.cor2 || '#F2A93B';
  // Mesmos neutros quentes da interface, para o cartão e o app serem uma
  // paleta só. O cartão é sempre claro: ele vai virar imagem, não segue tema.
  const tinta = '#1A1512';
  const tintaFraca = '#6E635C';
  const larguraUtil = LARGURA - PAD * 2;

  const trabalho = document.createElement('canvas');
  trabalho.width = LARGURA;
  trabalho.height = ALTURA_MAX;
  const ctx = trabalho.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, LARGURA, ALTURA_MAX);
  ctx.textBaseline = 'alphabetic';

  /* ---- faixa do topo ----
   *  Altura ditada pelo logo mais uma respiração. Era 232 com logo de 116: mais
   *  da metade da faixa era ar, e cada pixel gasto aqui empurra os telefones
   *  para fora do que o WhatsApp mostra no balão. */
  const alturaTopo = 176;
  ctx.fillStyle = marca;
  ctx.fillRect(0, 0, LARGURA, alturaTopo);

  const logo = await carregarLogo(cfg.logo);
  if (logo) {
    // Logo de marca já traz o nome escrito nele. Desenha no tamanho natural e
    // não repete "ACIONAR" ao lado — antes saía o nome duas vezes.
    const alturaMax = 104;
    const larguraMax = larguraUtil * 0.62;
    const escala = Math.min(alturaMax / logo.height, larguraMax / logo.width);
    const lw = logo.width * escala;
    const lh = logo.height * escala;
    ctx.drawImage(logo, PAD, (alturaTopo - lh) / 2, lw, lh);
  } else {
    const ladoLogo = 100;
    const logoY = (alturaTopo - ladoLogo) / 2;
    retanguloArredondado(ctx, PAD, logoY, ladoLogo, ladoLogo, 22);
    ctx.fillStyle = destaque;
    ctx.fill();
    ctx.fillStyle = marca;
    ctx.font = fnt(800, 58);
    ctx.textAlign = 'center';
    ctx.fillText('A', PAD + ladoLogo / 2, logoY + ladoLogo / 2 + 21);
    ctx.textAlign = 'left';

    const xTexto = PAD + ladoLogo + 28;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = fnt(800, 50);
    ctx.fillText('ACIONAR', xTexto, alturaTopo / 2 - 2);
    ctx.fillStyle = hexParaRgba('#FFFFFF', 0.78);
    ctx.font = fnt(500, 26);
    ctx.fillText(cfg.corretora || 'Corretora de Seguros', xTexto, alturaTopo / 2 + 40);
  }

  let y = alturaTopo + 38;

  /* ---- produto + bem segurado ---- */
  ctx.fillStyle = destaque;
  ctx.font = fnt(800, 25);
  textoEspacado(ctx, cartao.eyebrow, PAD, y, 3.4);
  y += 40;

  if (cartao.titulo) {
    // Ícone à esquerda do título, na altura das maiúsculas. Fica aqui e não
    // numa linha própria porque não custa altura nenhuma: o cartão já briga
    // para caber na proporção que o WhatsApp mostra inteira.
    const temIcone = !!cartao.iconeTitulo;
    const ladoIco = 54;
    const recuo = temIcone ? ladoIco + 20 : 0;

    if (temIcone) {
      const ix = PAD;
      const iy = y - 48;
      const p = (a, b) => [ix + a * ladoIco, iy + b * ladoIco];
      p.lado = ladoIco;
      ctx.save();
      ctx.strokeStyle = destaque;
      ctx.fillStyle = destaque;
      ctx.lineWidth = Math.max(2, ladoIco * 0.085);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      icones[cartao.iconeTitulo](ctx, p);
      ctx.restore();
    }

    ctx.fillStyle = tinta;
    ctx.font = fnt(800, 58);
    for (const linha of quebrarTexto(ctx, cartao.titulo, larguraUtil - recuo)) {
      ctx.fillText(linha, PAD + recuo, y);
      y += 62;
    }
  }

  if (cartao.subtitulo) {
    ctx.fillStyle = tintaFraca;
    ctx.font = fnt(600, 36);
    for (const linha of quebrarTexto(ctx, cartao.subtitulo, larguraUtil)) {
      ctx.fillText(linha, PAD, y);
      y += 40;
    }
  }

  /* ---- selo da seguradora ---- */
  if (cartao.seguradora) {
    y += 12;
    const alturaSelo = 62;
    // Logo da marca quando existe; senão o nome em texto, que funciona para
    // qualquer seguradora. O logo tem de ser a variante escura: o cartão é
    // branco e marca clara (o amarelo da Yelum) desaparece.
    const logoCia = await carregarLogo(cartao.logoSeguradora);

    let larguraSelo;
    if (logoCia) {
      const alturaLogo = 44;
      const escala = alturaLogo / logoCia.height;
      const larguraLogo = Math.min(logoCia.width * escala, larguraUtil - 80);
      larguraSelo = Math.min(larguraUtil, larguraLogo + 64);
      ctx.fillStyle = hexParaRgba(marca, 0.08);
      retanguloArredondado(ctx, PAD, y, larguraSelo, alturaSelo, 16);
      ctx.fill();
      ctx.fillStyle = marca;
      retanguloArredondado(ctx, PAD, y + 14, 8, alturaSelo - 28, 4);
      ctx.fill();
      ctx.drawImage(logoCia, PAD + 32, y + (alturaSelo - alturaLogo) / 2,
        larguraLogo, alturaLogo);
    } else {
      ctx.font = fnt(700, 34);
      larguraSelo = Math.min(larguraUtil, ctx.measureText(cartao.seguradora).width + 100);
      ctx.fillStyle = hexParaRgba(marca, 0.08);
      retanguloArredondado(ctx, PAD, y, larguraSelo, alturaSelo, 16);
      ctx.fill();
      ctx.fillStyle = marca;
      retanguloArredondado(ctx, PAD, y + 14, 8, alturaSelo - 28, 4);
      ctx.fill();
      // Nome em tinta cheia: é o dado que o cliente procura primeiro na hora
      // do sinistro, não pode ficar em cor de baixo contraste.
      ctx.fillStyle = tinta;
      ctx.fillText(cartao.seguradora, PAD + 32, y + alturaSelo / 2 + 12);
    }
    y += alturaSelo;
  }

  /* ---- detalhes da apólice, em duas colunas ---- */
  if (cartao.detalhes.length) {
    y += 32;
    const larguraColuna = (larguraUtil - 40) / 2;
    let coluna = 0;
    let yLinha = y;
    let fundoDaLinha = y; // a linha só desce depois da célula mais alta dela
    for (const d of cartao.detalhes) {
      const x = PAD + coluna * (larguraColuna + 40);
      ctx.fillStyle = tintaFraca;
      ctx.font = fnt(700, 22);
      textoEspacado(ctx, d.label.toUpperCase(), x, yLinha, 1.6);
      ctx.fillStyle = tinta;
      ctx.font = fnt(700, 34);
      let yv = yLinha + 36;
      for (const linha of quebrarTexto(ctx, d.valor, larguraColuna).slice(0, 2)) {
        ctx.fillText(linha, x, yv);
        yv += 38;
      }
      fundoDaLinha = Math.max(fundoDaLinha, yv + 8);
      if (coluna === 1) {
        yLinha = fundoDaLinha;
        coluna = 0;
      } else {
        coluna = 1;
      }
    }
    y = coluna === 1 ? fundoDaLinha : yLinha;
  }

  /* ---- coberturas ---- */
  if (cartao.extras.length) {
    y += 14;
    ctx.fillStyle = tintaFraca;
    ctx.font = fnt(700, 22);
    textoEspacado(ctx, 'COBERTURAS', PAD, y, 1.6);
    y += 30;
    ctx.font = fnt(500, 30);
    for (const linha of cartao.extras.slice(0, 6)) {
      ctx.fillStyle = destaque;
      ctx.fillText('•', PAD, y);
      ctx.fillStyle = tinta;
      for (const parte of quebrarTexto(ctx, linha, larguraUtil - 34)) {
        ctx.fillText(parte, PAD + 30, y);
        y += 36;
      }
      y += 2;
    }
  }

  /* ---- telefones ---- */
  const telSeguradora = cartao.telefones.filter((t) => t.grupo === 'seguradora');
  if (telSeguradora.length) {
    y += 16;
    ctx.strokeStyle = '#EBE4DF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(LARGURA - PAD, y);
    ctx.stroke();
    y += 34;

    ctx.fillStyle = tintaFraca;
    ctx.font = fnt(700, 22);
    textoEspacado(ctx, cartao.tituloTelefones, PAD, y, 1.6);
    y += 36;

    const yTopoTelefones = y;
    for (const t of telSeguradora) {
      ctx.fillStyle = destaque;
      retanguloArredondado(ctx, PAD, y - 6, 7, 62, 4);
      ctx.fill();
      ctx.fillStyle = tintaFraca;
      ctx.font = fnt(600, 24);
      ctx.fillText(t.rotulo, PAD + 26, y + 12);
      ctx.fillStyle = tinta;
      ctx.font = fnt(800, 46);
      ctx.fillText(t.numero, PAD + 26, y + 56);
      y += 84;
    }

    /* ---- QR de indicação ----
     *
     *  Entra no vazio à DIREITA dos telefones, que já existia e não era usado.
     *  Ao lado, e não embaixo, porque altura a mais faz o WhatsApp cortar a
     *  imagem no balão da conversa — e é justamente a lista de telefones que
     *  ficaria de fora. O `y` só avança se o bloco do QR passar do último
     *  telefone, o que acontece quando a seguradora tem menos de quatro.
     *
     *  A frase é permanentemente verdadeira, de propósito. Ver o bloco de
     *  comentário de codigoDeIndicacao(): a imagem é congelada e não há como
     *  corrigir promessa impressa. */
    if (cartao.codigoIndicacao) {
      const fim = desenharConviteIndicacao(ctx, cartao.codigoIndicacao, yTopoTelefones,
        { tinta, tintaFraca });
      y = Math.max(y, fim);
    }
  }

  /* ---- corretor ---- */
  const telCorretor = cartao.telefones.filter((t) => t.grupo === 'corretor');
  /* ---- rodapé: a corretora e o que mais ela vende ----
   *
   *  Aqui havia duas faixas separadas: a caixa "SEU CORRETOR" e, embaixo, uma
   *  tarja da marca dizendo "Salve este contato na sua agenda". A tarja
   *  prometia o que a imagem não faz — quem salva o contato é o .vcf, que vai
   *  num arquivo à parte — então virava instrução morta ocupando o pé do
   *  cartão. O espaço passou a divulgar o resto do que a corretora vende, que é
   *  o que o cliente tem em mãos justo quando acabou de fechar um seguro.
   *
   *  A faixa é pintada até o fim da tela de trabalho e o recorte final corta na
   *  altura real: assim não preciso somar as alturas antes de desenhar. */
  y += 22;
  const inicioRodape = y;
  ctx.fillStyle = marca;
  ctx.fillRect(0, inicioRodape, LARGURA, ALTURA_MAX - inicioRodape);

  // Sem rótulo "SEU CORRETOR" e sem divisor: o logo da corretora já está no
  // topo do mesmo cartão, e cada linha de enfeite aqui empurra os telefones da
  // seguradora para fora do que o balão do WhatsApp mostra.
  let yr = inicioRodape + 44;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = fnt(800, 34);
  ctx.fillText(cfg.corretor || cfg.corretora || 'Acionar', PAD, yr);

  if (telCorretor.length) {
    ctx.font = fnt(600, 26);
    ctx.fillStyle = hexParaRgba('#FFFFFF', 0.86);
    // Quebra entre telefones, nunca dentro de um. Quebrando por palavra, o
    // rótulo ficava numa linha e o número dele na seguinte — no primeiro teste
    // saiu "Escritório (horário comercial)" acima e o número solto embaixo,
    // colado no celular do corretor.
    const separador = '   ·   ';
    const escrever = (texto) => { yr += 34; ctx.fillText(texto, PAD, yr); };
    let linha = '';
    for (const t of telCorretor) {
      const unidade = `${t.rotuloRodape || t.rotulo} ${t.numero}`;
      const teste = linha ? linha + separador + unidade : unidade;
      if (linha && ctx.measureText(teste).width > larguraUtil) {
        escrever(linha);
        linha = unidade;
      } else {
        linha = teste;
      }
    }
    if (linha) escrever(linha);
  }

  yr += 36;
  ctx.fillStyle = hexParaRgba('#FFFFFF', 0.66);
  ctx.font = fnt(700, 21);
  textoEspacado(ctx, 'A ACIONAR TAMBÉM CUIDA DE', PAD, yr, 2.4);
  yr += 18;

  const larguraItem = larguraUtil / SERVICOS.length;
  const ladoIcone = 48;
  ctx.textAlign = 'center';
  for (let i = 0; i < SERVICOS.length; i += 1) {
    const centro = PAD + larguraItem * (i + 0.5);
    const ix = centro - ladoIcone / 2;
    const p = (a, b) => [ix + a * ladoIcone, yr + b * ladoIcone];
    p.lado = ladoIcone;
    ctx.save();
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(2, ladoIcone * 0.085);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    icones[SERVICOS[i].id](ctx, p);
    ctx.restore();
    ctx.fillStyle = hexParaRgba('#FFFFFF', 0.92);
    ctx.font = fnt(600, 21);
    ctx.fillText(SERVICOS[i].curto, centro, yr + ladoIcone + 26);
  }
  ctx.textAlign = 'left';
  yr += ladoIcone + 26;

  /* ---- ressalva ----
   *  Letra miúda de verdade, no pé, depois de tudo. O cartão é um resumo
   *  digitado à mão: se uma cobertura ou uma data saírem erradas, quem vale é o
   *  documento — e o cliente precisa ter lido isso antes de precisar. */
  if (cartao.ressalva) {
    yr += 34;
    ctx.fillStyle = hexParaRgba('#FFFFFF', 0.72);
    ctx.font = fnt(500, 20);
    for (const linha of quebrarTexto(ctx, cartao.ressalva, larguraUtil)) {
      ctx.fillText(linha, PAD, yr);
      yr += 26;
    }
    yr -= 26;
  }
  y = yr + 26;

  /* ---- marca d'água de exemplo ---- */
  if (cartao.ehExemplo) {
    ctx.save();
    ctx.translate(LARGURA / 2, y / 2);
    ctx.rotate(-Math.PI / 7);
    ctx.font = fnt(800, 92);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(217, 45, 32, 0.16)';
    const passo = 300;
    const repeticoes = Math.ceil(y / passo) + 1;
    for (let i = -repeticoes; i <= repeticoes; i += 1) {
      ctx.fillText('EXEMPLO', 0, i * passo);
      ctx.font = fnt(700, 34);
      ctx.fillText('TELEFONES NÃO CONFERIDOS', 0, i * passo + 56);
      ctx.font = fnt(800, 92);
    }
    ctx.restore();
  }

  /* ---- recorta na altura real, dentro da proporção que o WhatsApp mostra ----
   *
   *  O balão da conversa corta imagem em pé mais alta que 4:5 e exibe só o
   *  miolo. O cartão chegava sem o logo em cima e sem o rodapé embaixo, e quem
   *  recebe não abre a imagem para conferir — lê o que aparece no balão.
   *
   *  O layout foi apertado para caber em 4:5, mas cartão com muitas coberturas
   *  ou muitos telefones ainda estoura. Aí a folha cresce para os lados em vez
   *  de perder conteúdo: aparecer menor no balão é ruim, chegar sem o logo e
   *  sem os telefones é pior.
   *
   *  A margem não é branca — é a coluna de pixels da borda esticada. Assim as
   *  faixas do topo e do rodapé continuam sangrando até o canto, em vez de
   *  virarem tarjas soltas no meio de uma folha branca, e o corpo do cartão,
   *  que já é branco, segue branco.
   *
   *  Devolve um canvas próprio, nunca o da tela: redimensionar o canvas visível
   *  enquanto um toBlob dele está pendente descarta o callback, e a geração da
   *  imagem trava sem erro. */
  const alturaFinal = Math.min(ALTURA_MAX, Math.round(y));
  const larguraFinal = Math.max(LARGURA, Math.ceil(alturaFinal / PROPORCAO_MAX));
  const margem = Math.round((larguraFinal - LARGURA) / 2);
  const recorte = document.createElement('canvas');
  recorte.width = larguraFinal;
  recorte.height = alturaFinal;
  const saida = recorte.getContext('2d');
  saida.fillStyle = '#FFFFFF';
  saida.fillRect(0, 0, larguraFinal, alturaFinal);
  if (margem > 0) {
    saida.drawImage(trabalho, 0, 0, 1, alturaFinal, 0, 0, margem + 1, alturaFinal);
    saida.drawImage(trabalho, LARGURA - 1, 0, 1, alturaFinal,
      margem + LARGURA - 1, 0, larguraFinal - margem - LARGURA + 1, alturaFinal);
  }
  saida.drawImage(trabalho, 0, 0, LARGURA, alturaFinal, margem, 0, LARGURA, alturaFinal);
  return recorte;
}

function mostrarNoPreview(fonte) {
  const destino = el.canvasCartao;
  destino.width = fonte.width;
  destino.height = fonte.height;
  destino.getContext('2d').drawImage(fonte, 0, 0);
}

function dataUrlParaBlob(dataUrl) {
  const [cabecalho, dados] = dataUrl.split(',');
  const mime = (/:(.*?);/.exec(cabecalho) || [])[1] || 'image/png';
  const binario = atob(dados);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** PNG do canvas com rede de segurança: se o toBlob não responder, cai para o
 *  toDataURL, que é síncrono. Sem isso um encode perdido deixa o botão de
 *  enviar morto para sempre.
 *
 *  O toBlob é o caminho principal porque não trava a interface. O caminho
 *  síncrono custou 915 ms no cartão mais alto medido (1080x2184) — usar ele
 *  sempre congelaria a tela a cada atualização. O alarme abaixo é backstop de
 *  defeito, não ajuste de desempenho: o toBlob legítimo levou 1,3 s nesse mesmo
 *  cartão, então o prazo tem de ficar bem acima disso para não punir aparelho
 *  lento com o dobro do trabalho. */
function canvasParaBlobPng(canvas) {
  return new Promise((resolve) => {
    let respondido = false;
    const terminar = (blob) => {
      if (respondido) return;
      respondido = true;
      resolve(blob);
    };
    const reserva = () => {
      try {
        return dataUrlParaBlob(canvas.toDataURL('image/png'));
      } catch (erro) {
        console.error('Falha ao gerar o PNG', erro);
        return null;
      }
    };
    const alarme = setTimeout(() => terminar(reserva()), 6000);
    try {
      canvas.toBlob((blob) => {
        clearTimeout(alarme);
        terminar(blob || reserva());
      }, 'image/png');
    } catch (erro) {
      clearTimeout(alarme);
      terminar(reserva());
    }
  });
}

/** Foto do contato a partir do logo.
 *
 *  Teto de ~60 KB: acima disso parte dos importadores desiste da foto — ou do
 *  arquivo inteiro. PNG de logo achatado costuma dar poucos KB, mas logo com
 *  degradê ou foto estoura fácil (medido: 67 KB), então cai para JPEG, que
 *  resolve o mesmo caso em 4 KB. Devolve o tipo junto porque o TYPE do vCard
 *  tem de bater com os bytes. */
const LIMITE_FOTO_BASE64 = 82000;

async function logoParaVCard(dataUrl) {
  const img = await carregarLogo(dataUrl);
  if (!img) return null;

  const lado = 256;
  const escala = Math.min(lado / img.width, lado / img.height);
  const w = img.width * escala;
  const h = img.height * escala;
  const x = (lado - w) / 2;
  const y = (lado - h) / 2;

  const desenhar = () => {
    const c = document.createElement('canvas');
    c.width = lado;
    c.height = lado;
    const ctx = c.getContext('2d');
    // Fundo na cor da marca, não branco nem transparente. O logo oficial da
    // Acionar é branco vazado: sobre fundo claro ele desaparece, e a agenda
    // do cliente mostra a foto do contato sobre fundo claro.
    ctx.fillStyle = estado.config.cor1 || '#EB6522';
    ctx.fillRect(0, 0, lado, lado);
    ctx.drawImage(img, x, y, w, h);
    return c;
  };

  const tela = desenhar();
  const tentativas = [
    { tipo: 'PNG', mime: 'image/png', qualidade: undefined },
    { tipo: 'JPEG', mime: 'image/jpeg', qualidade: 0.85 },
    { tipo: 'JPEG', mime: 'image/jpeg', qualidade: 0.6 }
  ];

  for (const t of tentativas) {
    const base64 = tela.toDataURL(t.mime, t.qualidade).split(',')[1] || '';
    if (base64 && base64.length <= LIMITE_FOTO_BASE64) return { base64, tipo: t.tipo };
  }
  return null;
}

/* ==========================================================================
   Formulário
   ========================================================================== */

function renderChipsProduto() {
  el.chipsProduto.innerHTML = '';
  for (const id of estado.ordemProdutos) {
    const p = estado.produtos[id];
    if (!p) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(id === estado.produtoId));
    // Um único ponto de tabulação no grupo, como manda o padrão de radiogroup:
    // seis chips com tabIndex 0 obrigavam seis toques de Tab para atravessar o
    // passo 1. Dentro do grupo quem anda são as setas, abaixo.
    b.tabIndex = id === estado.produtoId ? 0 : -1;
    b.dataset.produto = id;
    b.textContent = `${p.icone || ''} ${p.nome}`.trim();
    b.addEventListener('click', () => trocarProduto(id));
    el.chipsProduto.appendChild(b);
  }
}

/** Setas, Home e End dentro do grupo de produtos.
 *
 *  O papel `radio` promete essa navegação a quem usa leitor de tela ou teclado:
 *  anunciado como grupo de rádio e imóvel nas setas, o passo 1 parece quebrado.
 *  Registrado no container e não em cada chip, porque a lista é remontada a cada
 *  troca de produto — listener no container sobrevive. */
function navegarChips(evento) {
  const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[evento.key];
  const ordem = estado.ordemProdutos;
  if (!ordem.length) return;

  let destino = null;
  if (passo) {
    const i = ordem.indexOf(estado.produtoId);
    destino = ordem[(((i < 0 ? 0 : i) + passo) + ordem.length) % ordem.length];
  } else if (evento.key === 'Home') {
    destino = ordem[0];
  } else if (evento.key === 'End') {
    destino = ordem[ordem.length - 1];
  }
  if (!destino) return;

  evento.preventDefault();
  trocarProduto(destino);
  // Depois do trocarProduto, porque ele remonta os chips e o nó antigo já não
  // existe. Sem devolver o foco, a seta seguinte não teria de onde sair.
  el.chipsProduto.querySelector(`[data-produto="${destino}"]`)?.focus();
}

function trocarProduto(id) {
  if (id === estado.produtoId) return;
  estado.produtoId = id;
  // Mantém o que faz sentido entre produtos, descarta o resto.
  const preservados = ['segurado', 'apolice', 'vigenciaInicio', 'vigenciaFim'];
  const antigos = estado.dados;
  estado.dados = {};
  for (const k of preservados) if (antigos[k]) estado.dados[k] = antigos[k];

  // A lista de fornecedores muda junto com o produto. Se a escolhida não serve
  // o produto novo, ela sai: manter a Yelum selecionada ao trocar para
  // consórcio deixaria o cartão com os telefones errados sem nenhum aviso.
  if (estado.seguradoraId && !catalogoDoProduto().some((s) => s.id === estado.seguradoraId)) {
    estado.seguradoraId = null;
  }

  renderChipsProduto();
  renderSeguradoras();
  renderTelefonesSeguradora();
  renderAvisoExemplo();
  renderFormulario();
  atualizar();
}

function renderSeguradoras() {
  if (!el.selSeguradora) return;
  const lista = catalogoDoProduto();
  el.selSeguradora.innerHTML = '';
  const vazio = document.createElement('option');
  vazio.value = '';
  vazio.textContent = '— escolha —';
  el.selSeguradora.appendChild(vazio);
  for (const s of lista) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.exemplo ? `${s.nome} (exemplo)` : s.nome;
    el.selSeguradora.appendChild(o);
  }
  el.selSeguradora.value = estado.seguradoraId || '';

  // "Seguradora" e "Administradora" não são sinônimos para quem vende, e o
  // rótulo errado na tela é o tipo de detalhe que faz o vendedor desconfiar do
  // resto do cartão.
  const termo = produtoAtual()?.rotuloFornecedor || 'Seguradora';
  if (el.rotuloSeguradora) el.rotuloSeguradora.textContent = termo;
  if (el.tituloPasso2) el.tituloPasso2.textContent = termo;
  if (el.btnCatalogo) {
    el.btnCatalogo.textContent = `Cadastrar telefones e logo das ${
      (produtoAtual()?.rotuloFornecedorPlural || 'seguradoras').toLowerCase()}`;
  }
}

function renderAvisoExemplo() {
  const lista = catalogoDoProduto();
  const exemplos = lista.filter((s) => s.exemplo).length;
  el.bannerExemplo.hidden = exemplos === 0;
  const termo = (produtoAtual()?.rotuloFornecedorPlural || 'seguradoras').toLowerCase();
  el.bannerExemploTexto.textContent = exemplos
    ? ` ${exemplos} de ${lista.length} ${termo}. `
    : '';
}

function renderTelefonesSeguradora() {
  const s = seguradoraAtual();
  el.listaTelefones.innerHTML = '';
  if (!s) {
    const li = document.createElement('li');
    li.className = 'telefones__vazio';
    li.textContent = 'Escolha a seguradora para carregar os telefones.';
    el.listaTelefones.appendChild(li);
    return;
  }
  for (const t of s.telefones || []) {
    const li = document.createElement('li');
    const rot = document.createElement('span');
    rot.className = 'telefones__rot';
    rot.textContent = t.rotulo;
    const num = document.createElement('span');
    num.className = 'telefones__num';
    num.textContent = t.numero;
    li.append(rot, num);
    el.listaTelefones.appendChild(li);
  }
}

/** Sugestão que depende de outro campo.
 *
 *  O consórcio pergunta o tipo do bem antes da descrição, e a sugestão
 *  "Apartamento" ficava na tela mesmo depois de escolher Automóvel. Sugestão
 *  errada é pior que sugestão nenhuma: ela parece instrução. */
function placeholderDoCampo(campo) {
  const dep = campo.placeholderPor;
  if (dep) {
    const escolhido = dep.valores[String(estado.dados[dep.campo] || '').trim()];
    if (escolhido) return escolhido;
  }
  return campo.placeholder || '';
}

/** O formulário só é remontado ao trocar de produto, então quem depende de
 *  outro campo precisa ser atualizado a cada digitação. */
function atualizarPlaceholders() {
  const produto = produtoAtual();
  if (!produto) return;
  for (const campo of produto.campos) {
    if (!campo.placeholderPor) continue;
    const entrada = document.getElementById('campo-' + campo.id);
    if (entrada) entrada.placeholder = placeholderDoCampo(campo);
  }
}

function renderFormulario() {
  const produto = produtoAtual();
  el.formDados.innerHTML = '';
  if (!produto) return;

  for (const campo of produto.campos) {
    const wrap = document.createElement('label');
    wrap.className = 'campo' + (campo.largura === 'full' ? ' campo--full' : '');

    const rot = document.createElement('span');
    rot.className = 'campo__label';
    rot.textContent = campo.label;
    if (!campo.obrigatorio) {
      const opc = document.createElement('span');
      opc.className = 'campo__opc';
      opc.textContent = ' (opcional)';
      rot.appendChild(opc);
    }
    wrap.appendChild(rot);

    let entrada;
    if (campo.tipo === 'textarea') {
      entrada = document.createElement('textarea');
    } else if (campo.tipo === 'select') {
      // Lista fechada onde escrever à mão só gera divergência: o tipo do bem do
      // consórcio vira o eyebrow do cartão, e "imovel", "Imóvel" e "IMÓVEL"
      // sairiam três cartões diferentes para a mesma coisa.
      entrada = document.createElement('select');
      for (const op of campo.opcoes || []) {
        const o = document.createElement('option');
        o.value = op;
        o.textContent = op;
        entrada.appendChild(o);
      }
      if (!campo.obrigatorio || !estado.dados[campo.id]) {
        const vazio = document.createElement('option');
        vazio.value = '';
        vazio.textContent = campo.placeholder || '— escolha —';
        entrada.insertBefore(vazio, entrada.firstChild);
      }
    } else {
      entrada = document.createElement('input');
    }
    entrada.className = 'campo__input';
    entrada.id = 'campo-' + campo.id;
    entrada.dataset.campo = campo.id;
    entrada.dataset.tipo = campo.tipo;
    if (campo.tipo !== 'select') {
      const ph = placeholderDoCampo(campo);
      if (ph) entrada.placeholder = ph;
    }
    if (campo.tipo !== 'textarea' && campo.tipo !== 'select') {
      entrada.type = campo.tipo === 'data' ? 'date' : 'text';
      entrada.autocomplete = 'off';
      if (campo.tipo === 'placa') {
        entrada.autocapitalize = 'characters';
        entrada.spellcheck = false;
      }
      if (campo.tipo === 'dinheiro') entrada.inputMode = 'decimal';
    }
    entrada.value = estado.dados[campo.id] || '';

    const anotarValor = () => {
      let v = entrada.value;
      if (campo.tipo === 'placa') {
        v = formatarPlaca(v);
        entrada.value = v;
      }
      estado.dados[campo.id] = v;
      atualizarPlaceholders();
      agendarAtualizacao();
    };
    entrada.addEventListener('input', anotarValor);
    // Safari antigo não dispara 'input' em <select>. Sem isto o tipo do bem
    // ficava escolhido na tela e ausente no cartão.
    if (campo.tipo === 'select') entrada.addEventListener('change', anotarValor);
    entrada.addEventListener('blur', () => {
      if (campo.tipo === 'dinheiro') {
        const v = formatarDinheiro(entrada.value);
        entrada.value = v;
        estado.dados[campo.id] = v;
        atualizar();
      }
    });

    wrap.appendChild(entrada);

    if (campo.ajuda) {
      const ajuda = document.createElement('span');
      ajuda.className = 'campo__ajuda';
      ajuda.textContent = campo.ajuda;
      wrap.appendChild(ajuda);
    }

    el.formDados.appendChild(wrap);
  }
}

function renderPendencias() {
  const { impedimentos, avisos } = conferirCartao();
  estado.bloqueado = impedimentos.length > 0;

  const blocos = [];
  if (impedimentos.length) {
    blocos.push('<strong>Falta para poder enviar:</strong><ul>' +
      impedimentos.map((t) => `<li>${escaparHtml(t)}</li>`).join('') + '</ul>');
  }
  if (avisos.length) {
    blocos.push('<strong>Recomendado:</strong><ul>' +
      avisos.map((t) => `<li>${escaparHtml(t)}</li>`).join('') + '</ul>');
  }

  el.pendencias.hidden = blocos.length === 0;
  // Só escreve quando o texto MUDA. A caixa é uma região aria-live: reescrever
  // o mesmo conteúdo a cada tecla digitada faria o leitor de tela repetir a
  // lista inteira de impedimentos a cada letra do nome do segurado — aviso que
  // não para de falar é aviso desligado. Assim ele anuncia uma vez, quando o
  // que falta realmente muda.
  const html = blocos.join('');
  if (el.pendencias.innerHTML !== html) el.pendencias.innerHTML = html;
  el.pendencias.classList.toggle('pendencias--impede', estado.bloqueado);
  atualizarAcoes();
}

/** Trava tudo que gera um entregável enquanto o cartão estiver incompleto.
 *
 *  Duas condições diferentes, e a distinção importa:
 *    - `completo` = o formulário está preenchido. Manda em quem APARECE.
 *    - `pronto`   = além disso, os arquivos do cartão ATUAL já existem. Manda em
 *                   quem está HABILITADO.
 *
 *  Antes era uma só, e o efeito colateral era o pisca-pisca: durante o
 *  redesenho os passos 2 e 3 sumiam da tela e voltavam, empurrando o layout a
 *  cada tecla digitada. Agora o botão fica cinza no lugar dele. */
function atualizarAcoes() {
  const completo = !estado.bloqueado;
  const pronto = completo && !!estado.artefatos;
  for (const botao of [el.btnEnviar, el.btnVcf, el.btnPng, el.btnMensagem]) {
    if (botao) botao.disabled = !pronto;
  }

  // Os dois passos existem SEMPRE, em todo aparelho, na ordem de uso.
  //
  // Antes este botão ficava escondido no iOS, porque eu supunha que lá os dois
  // arquivos iam juntos num toque só. Não iam: o iPhone mandava só o contato e
  // não sobrava botão nenhum para a imagem. Esconder um passo com base numa
  // suposição sobre a plataforma foi o erro; agora os dois estão à vista e cada
  // um faz o que o rótulo diz.
  if (el.btnContatoDepois) {
    el.btnContatoDepois.hidden = !completo;
    el.btnContatoDepois.disabled = !pronto;
  }

  // Sempre visível, como os outros dois. Tentei mostrá-lo só depois do envio da
  // imagem, para a tela ficar mais limpa, e o resultado foi o oposto: a marca
  // de "imagem enviada" vive na memória da página, e o iPhone recarrega a
  // página quando se volta do WhatsApp. O botão sumia exatamente no momento em
  // que era necessário. É o mesmo erro que o botão do contato já tinha tido.
  //
  // Três passos à vista, numerados, na ordem de uso. Previsível ganha de
  // esperto.
  if (el.btnMensagemDepois) {
    el.btnMensagemDepois.hidden = !completo;
    el.btnMensagemDepois.disabled = !pronto;
  }

  // O link mora dentro da mensagem, que o app nunca exibe. Sem mostrá-lo aqui,
  // não há como saber que ele existe nem como conferir a página antes de mandar
  // para um cliente — e a primeira reação a ele foi "não tem os links".
  //
  // Não depende dos artefatos: o link é da seguradora escolhida, não do cartão
  // montado. Amarrá-lo ao cartão fazia o endereço desaparecer e voltar a cada
  // tecla digitada, sem nenhum motivo.
  if (el.blocoLink) {
    const url = completo ? linkDoCartao() : '';
    el.blocoLink.hidden = !url;
    if (url) {
      el.linkCliente.textContent = url;
      el.linkCliente.href = url;
    }
  }
}

function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ==========================================================================
   Atualização da prévia e dos artefatos
   ========================================================================== */

let timerAtualizacao = null;
let atualizando = false;
let pedidoPendente = false;

/** O cartão que está na memória não vale mais.
 *
 *  Chamado no instante em que o formulário muda, antes de qualquer redesenho.
 *  Antes eu desabilitava três botões à mão aqui e o estado.artefatos continuava
 *  apontando para o cartão ANTERIOR — e os passos 2 e 3 nem estavam na lista.
 *  Digitava uma placa nova e, nos 250 ms de espera mais o tempo de desenhar
 *  (medi 1,3 s no cartão mais alto), "2. Enviar a mensagem" e "3. Enviar o
 *  contato" continuavam ativos, com o .vcf da placa velha pronto para ir. Um
 *  toque rápido depois de corrigir um campo mandava o contato do veículo
 *  errado, sem nada na tela dizendo isso.
 *
 *  Zerando os artefatos, o atualizarAcoes trava os cinco de uma vez e o enviar()
 *  cai no "Ainda estou montando o cartão" — que é a verdade. */
function descartarArtefatos() {
  estado.artefatos = null;
  atualizarAcoes();
}

function agendarAtualizacao() {
  clearTimeout(timerAtualizacao);
  descartarArtefatos();
  timerAtualizacao = setTimeout(atualizar, 250);
}

/** Uma atualização por vez.
 *
 *  Desenhar e codificar o PNG são assíncronos. Rodando em paralelo, duas
 *  atualizações mexem no mesmo canvas e uma invalida o encode da outra — o
 *  cartão parava de ser gerado e o botão de enviar ficava morto. Serializando,
 *  quem chegar durante uma execução só marca que há novidade, e o laço repete
 *  ao final. O último estado pedido é sempre o que fica na tela.  */
async function atualizar() {
  clearTimeout(timerAtualizacao);
  if (atualizando) {
    pedidoPendente = true;
    return;
  }
  atualizando = true;
  try {
    do {
      pedidoPendente = false;
      await executarAtualizacao();
    } while (pedidoPendente);
  } finally {
    atualizando = false;
  }
}

async function executarAtualizacao() {
  const cartao = montarCartao();
  if (!cartao) return;

  // Aqui também, e não só no agendarAtualizacao: trocar a seguradora no
  // <select>, sair de um campo de dinheiro, salvar as configurações ou usar um
  // cartão do histórico chamam atualizar() direto, sem passar pelo agendamento.
  // Nesses caminhos o cartão velho ficava enviável do mesmo jeito — e trocar a
  // seguradora é o pior deles, porque o .vcf pendurado tem os telefones da
  // seguradora anterior.
  descartarArtefatos();
  el.nomeContato.textContent = cartao.nomeContato || '—';
  renderPendencias();
  salvarRascunho();

  try {
    const imagem = await desenharCartao(cartao);
    mostrarNoPreview(imagem);

    cartao.foto = estado.config.fotoNoContato
      ? await logoParaVCard(estado.config.logo)
      : null;
    fotoRecusada = estado.config.fotoNoContato && !!estado.config.logo && !cartao.foto;
    renderPendencias();

    // Os arquivos ficam prontos ANTES do toque em Enviar: no iOS o
    // navigator.share falha se for chamado depois de um await.
    const pngBlob = await canvasParaBlobPng(imagem);

    const base = (cartao.ehExemplo ? 'EXEMPLO-' : '') + nomeArquivoSeguro(cartao.nomeContato);
    const artefatos = {
      cartao,
      vcfTexto: montarVCard(cartao),
      mensagem: mensagemWhatsApp(cartao),
      nomeVcf: base + '.vcf',
      nomePng: base + '.png',
      pngBlob
    };
    // Arquivos e sondagem prontos ANTES do toque, para o share ser imediato.
    artefatos.envio = prepararEnvio(artefatos);
    estado.artefatos = artefatos;
  } catch (erro) {
    console.error('Falha ao montar o cartão', erro);
    statusEnvio('Não consegui montar o cartão. Mude algum campo para tentar de novo.', 'erro');
  } finally {
    // Botão travado é pior que cartão desatualizado: sem isso uma falha
    // deixava o vendedor sem nenhuma saída na tela.
    atualizarAcoes();
  }
}

/* ==========================================================================
   Envio
   ========================================================================== */

function statusEnvio(texto, tipo) {
  el.statusEnvio.textContent = texto;
  el.statusEnvio.className = 'status' + (tipo ? ' status--' + tipo : '');
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* Registro do último envio.
 *
 * Existe porque eu passei várias rodadas teorizando sobre o aparelho do
 * vendedor a partir de "só foi texto". Agora o app anota o que realmente
 * aconteceu — o que o navegador respondeu a cada combinação, qual caminho foi
 * escolhido, e se o compartilhamento resolveu ou deu erro. Sai no diagnóstico. */
let registroEnvio = [];

function anotar(texto) {
  registroEnvio.push(`${registroEnvio.length + 1}) ${texto}`);
}

function descreverArquivos(arquivos) {
  return arquivos.map((f) => `${f.name.split('.').pop()} ${f.type} ${Math.round(f.size / 1024)}KB`).join(' + ');
}

/** Monta os arquivos e decide o que este navegador aceita — FORA do toque.
 *
 *  Roda junto da geração do cartão, não no clique. Assim o clique em Enviar
 *  chama navigator.share como primeira instrução, sem nada antes: construir
 *  File, sondar canShare, montar texto de log, tudo isso acontece entre o
 *  toque e o share e é candidato a fazer o navegador considerar a ativação
 *  gasta — o erro era "NotAllowedError: Permission denied". */
/** No Android, .vcf não pode ir pelo compartilhamento nativo. Ponto.
 *
 *  O Chromium mantém uma lista fechada de extensões permitidas no Web Share
 *  (`.png`, `.jpg`, `.pdf`, `.txt`… 47 delas) e `.vcf` não está nela. O detalhe
 *  que me custou meia tarde: `navigator.canShare()` responde **sim** para o
 *  .vcf, e a lista só é aplicada dentro do `share()`, que rejeita com
 *  "NotAllowedError: Permission denied". Sondar não serve de nada aqui.
 *
 *  No iOS o Safari não usa essa lista, então lá o .vcf continua sendo tentado. */
function vcfPodeSerCompartilhado() {
  return !/Android/i.test(navigator.userAgent);
}

/** O passo 3 muda de natureza conforme o aparelho: no iOS o contato vai por
 *  compartilhamento, no Android só por download. O rótulo precisa dizer o que o
 *  toque faz de verdade — prometer "enviar" onde só dá para baixar é o tipo de
 *  mentira que faz o vendedor ficar procurando um envio que nunca aconteceu. */
function rotuloPasso3() {
  return vcfPodeSerCompartilhado() ? '3. Enviar o contato' : '3. Baixar o contato';
}

function prepararEnvio(art) {
  const tipos = ['text/vcard', 'text/x-vcard'];
  const png = art.pngBlob ? new File([art.pngBlob], art.nomePng, { type: 'image/png' }) : null;
  const relatorio = [];
  const comVcf = vcfPodeSerCompartilhado();
  if (!comVcf) {
    relatorio.push('Android: .vcf fora do compartilhamento (não está na lista do Chromium; o canShare mente sobre isso)');
  }

  // Cada combinação é sondada e registrada uma única vez: as três seleções
  // compartilham candidatos, e sem isso o relatório saía com linhas repetidas.
  const jaSondado = new Map();
  const aceita = (nome, arquivos) => {
    if (jaSondado.has(nome)) return jaSondado.get(nome);
    let ok = false;
    try {
      ok = !!navigator.canShare && navigator.canShare({ files: arquivos });
      relatorio.push(`canShare ${nome} [${descreverArquivos(arquivos)}] = ${ok ? 'sim' : 'não'}`);
    } catch (erro) {
      relatorio.push(`canShare ${nome} deu erro: ${erro.name}`);
      ok = false;
    }
    jaSondado.set(nome, ok);
    return ok;
  };

  const primeiroAceito = (candidatos) => {
    for (const c of candidatos) {
      if (!c || !c.arquivos.every(Boolean)) continue;
      if (aceita(c.nome, c.arquivos)) return c.arquivos;
    }
    return null;
  };

  // Não existe mais envio combinado, e a razão é de campo: ele falhou nas duas
  // plataformas, de formas diferentes. No Android o .vcf está fora da lista do
  // Chromium, então o par nunca passa. No iOS o canShare recusa a mistura
  // imagem+vcard, e a escada antiga caía no candidato seguinte — "só contato" —
  // mandando o .vcf sozinho e descartando a imagem sem dizer nada. Um toque
  // entregava o artefato errado.
  //
  // Dois passos explícitos em todo aparelho: a imagem primeiro, que é o que o
  // cliente lê, e o contato depois, que tem plano B (baixar e anexar).
  const parVcf = comVcf ? tipos.map((t) => new File([art.vcfTexto], art.nomeVcf, { type: t })) : [];
  const soVcf = parVcf.map((v, i) => ({ nome: `só contato (${tipos[i]})`, arquivos: [v] }));
  const soPng = png ? [{ nome: 'só imagem', arquivos: [png] }] : [];

  return {
    vcf: primeiroAceito(soVcf),
    png: primeiroAceito(soPng),
    relatorio
  };
}

function enviar(selecao) {
  const art = estado.artefatos;
  if (!art) {
    statusEnvio('Ainda estou montando o cartão. Tente de novo em 1 segundo.', 'erro');
    return;
  }
  if (estado.bloqueado) {
    statusEnvio('Cartão incompleto. Veja o que falta logo acima.', 'erro');
    return;
  }

  const envio = art.envio || { relatorio: ['envio não foi preparado'] };
  const arquivos = envio[selecao];
  if (!arquivos) {
    registroEnvio = envio.relatorio.slice();
    if (selecao === 'vcf') {
      // Pedido específico do contato num aparelho que não compartilha .vcf:
      // baixa só ele, sem encher a pasta de arquivo que não foi pedido.
      anotar('contato não é compartilhável aqui — baixando só ele');
      baixarVcf(art);
      statusEnvio('O contato está em Downloads. No WhatsApp, toque no clipe 📎 → Documento e escolha '
        + art.nomeVcf + '.', 'ok');
      return;
    }
    anotar('nenhuma combinação aceita — caindo no plano B (baixar + link)');
    registrarHistorico(art.cartao);
    baixarTudo(art);
    return;
  }

  // ---- daqui até o share, NADA. ----
  //
  // A mensagem não vai dentro do share (no Android, `files` junto com `text`
  // faz o navegador tratar tudo como texto puro e o WhatsApp descarta os
  // anexos) e a cópia dela acontece depois, porque
  // navigator.clipboard.writeText() consome o gesto do usuário.
  //
  // Mas nem só a cópia: montar File, sondar canShare e formatar log também
  // ficam entre o toque e o share. Tudo isso foi movido para prepararEnvio(),
  // que roda ao gerar o cartão. O share é a primeira instrução após o clique.
  let promessa;
  try {
    promessa = navigator.share({ files: arquivos });
  } catch (erro) {
    registroEnvio = envio.relatorio.slice();
    anotar(`navigator.share lançou na hora: ${erro && erro.name}: ${erro && erro.message}`);
    registrarHistorico(art.cartao);
    baixarTudo(art);
    return;
  }

  registroEnvio = envio.relatorio.slice();
  anotar(`pedido: ${selecao === 'vcf' ? 'só o contato' : 'só a imagem'}`);
  anotar(`chamei navigator.share com [${descreverArquivos(arquivos)}], sem campo text, como 1ª instrução do toque`);

  promessa
    .then(async () => {
      anotar('navigator.share resolveu sem erro');
      registrarHistorico(art.cartao);
      if (selecao === 'vcf') {
        statusEnvio('Contato enviado. O cliente já tem o cartão completo: imagem e contato.', 'ok');
        return;
      }
      // A mensagem é legenda da imagem, então a cópia acontece só aqui. No passo
      // do contato ela não serve para nada e ainda trocaria a área de
      // transferência bem quando ele fosse colar a legenda.
      const copiou = await copiar(art.mensagem).catch(() => false);
      anotar('mensagem copiada: ' + (copiou ? 'sim' : 'não'));

      // A imagem vai sozinha, sem texto: quem não colar a legenda manda a foto
      // sem uma palavra escrita, e sem o link. Por isso o aviso aponta o passo 2
      // antes de falar em colar.
      const passos = ['Imagem enviada.', ''];
      passos.push('A mensagem NÃO vai junto com a foto. Para o cliente receber o link, '
        + 'toque no passo 2 aqui embaixo.');
      passos.push('');
      passos.push(copiou
        ? 'Ela também está copiada, se preferir colar na legenda da foto.'
        : 'Não consegui copiar a mensagem para colar — use o passo 2.');
      passos.push('');
      // O rótulo vem do próprio botão, não de rotuloPasso3(): o diagnóstico
      // reescreve esse texto quando o navegador não compartilha arquivo nenhum,
      // e a mensagem mandaria procurar um botão com outro nome.
      passos.push('Depois, o passo 3: "' + (el.btnContatoDepois ? el.btnContatoDepois.textContent : 'Enviar o contato') + '".');
      statusEnvio(passos.join('\n'), 'ok');
    })
    .catch((erro) => {
      anotar(`navigator.share deu ${erro && erro.name}: ${erro && erro.message}`);
      if (erro && erro.name === 'AbortError') {
        statusEnvio('Envio cancelado.');
        return;
      }
      console.warn('Compartilhamento falhou, baixando os arquivos', erro);
      registrarHistorico(art.cartao);
      baixarTudo(art);
    });
}

/** Plano B do envio da mensagem: se o navegador não compartilha texto, ela
 *  ainda pode ser colada à mão — mas o vendedor precisa saber disso. */
function semCompartilharTexto(art, erro) {
  anotar(`share de texto falhou: ${erro && erro.name}: ${erro && erro.message}`);
  copiar(art.mensagem).then((copiou) => {
    statusEnvio(copiou
      ? 'Este navegador não abre o compartilhamento de texto. A mensagem está copiada — '
        + 'abra a conversa no WhatsApp e cole.'
      : 'Não consegui compartilhar nem copiar a mensagem. Em "Não funcionou? Outras opções", '
        + 'toque em "Copiar mensagem".', copiou ? 'ok' : 'erro');
  });
}

function baixarVcf(art) {
  baixar(new Blob([art.vcfTexto], { type: 'text/vcard;charset=utf-8' }), art.nomeVcf);
}

function baixarTudo(art) {
  // Falhou: agora as saídas de emergência importam, então aparecem.
  if (el.maisEnvio) el.maisEnvio.open = true;
  if (art.pngBlob) baixar(art.pngBlob, art.nomePng);
  baixar(new Blob([art.vcfTexto], { type: 'text/vcard;charset=utf-8' }), art.nomeVcf);
  const numero = telParaWaMe(estado.whatsCliente);
  copiar(art.mensagem).then((copiou) => {
    // Aqui o texto pode ir na URL: não há arquivo na mesma chamada para ele
    // atropelar. É o WhatsApp que não aceita anexo por link.
    if (numero) window.open(`https://wa.me/${numero}?text=${encodeURIComponent(art.mensagem)}`, '_blank', 'noopener');

    // Tom neutro, não de erro. Este caminho funciona; é só mais longo. Tratar
    // como falha fazia o vendedor achar que o app estava quebrado quando na
    // verdade o cartão ia chegar inteiro. O registro técnico fica no
    // diagnóstico, fora do caminho de quem só quer enviar.
    const passos = ['Este navegador não anexa sozinho. Faltam 2 toques:'];
    passos.push('\n1. No WhatsApp, toque no clipe 📎 → Documento');
    passos.push('\n2. Escolha os dois arquivos em Downloads (imagem e contato)');
    if (copiou) passos.push('\n\nA mensagem está copiada — cole na legenda.');
    statusEnvio(passos.join(''), 'ok');
  });
}

/** Devolve promessa de boolean: copiou de verdade ou não.
 *
 *  Antes engolia a falha e sempre resolvia, então a tela dizia "mensagem
 *  copiada" mesmo quando não tinha copiado — e o vendedor ia procurar o que
 *  colar na legenda do WhatsApp sem ter nada na área de transferência. */
function copiar(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(texto).then(() => true, () => copiarLegado(texto));
  }
  return Promise.resolve(copiarLegado(texto));
}

function copiarLegado(texto) {
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let deu = false;
  try { deu = document.execCommand('copy'); } catch (_) { deu = false; }
  ta.remove();
  return deu;
}

/* ==========================================================================
   Histórico
   ========================================================================== */

function lerHistorico() {
  try { return JSON.parse(localStorage.getItem(CHAVE_HISTORICO) || '[]'); } catch (_) { return []; }
}

function registrarHistorico(cartao) {
  const itens = lerHistorico().filter((i) => i.nomeContato !== cartao.nomeContato);
  itens.unshift({
    nomeContato: cartao.nomeContato,
    produtoId: cartao.produtoId,
    seguradoraId: estado.seguradoraId,
    seguradora: cartao.seguradora,
    dados: { ...estado.dados },
    whatsCliente: estado.whatsCliente,
    quando: new Date().toISOString()
  });
  try {
    localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(itens.slice(0, MAX_HISTORICO)));
  } catch (erro) {
    // Sem rede de proteção, o estouro de espaço acontecia DENTRO do envio: a
    // imagem ia, o erro subia, e a confirmação nunca aparecia na tela. Perder
    // uma linha do histórico é aceitável; perder o aviso de que deu certo não.
    console.warn('não consegui gravar o histórico', erro);
  }
  renderHistorico();
}

function renderHistorico() {
  const itens = lerHistorico();
  el.listaHistorico.innerHTML = '';
  el.btnLimparHistorico.hidden = itens.length === 0;
  if (!itens.length) {
    const li = document.createElement('li');
    li.className = 'historico__vazio';
    li.textContent = 'Os cartões que você enviar aparecem aqui, prontos para reenviar ou renovar.';
    el.listaHistorico.appendChild(li);
    return;
  }
  for (const item of itens) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'historico__info';
    const nome = document.createElement('div');
    nome.className = 'historico__nome';
    nome.textContent = item.nomeContato;
    const meta = document.createElement('div');
    meta.className = 'historico__meta';
    const quando = new Date(item.quando);
    meta.textContent = [item.seguradora, isNaN(quando) ? '' : quando.toLocaleDateString('pt-BR')].filter(Boolean).join(' · ');
    info.append(nome, meta);
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'botao';
    botao.textContent = 'Usar';
    botao.addEventListener('click', () => carregarDoHistorico(item));
    li.append(info, botao);
    el.listaHistorico.appendChild(li);
  }
}

function carregarDoHistorico(item) {
  if (item.produtoId && estado.produtos[item.produtoId]) estado.produtoId = item.produtoId;
  estado.seguradoraId = item.seguradoraId || estado.seguradoraId;
  estado.dados = { ...item.dados };
  estado.whatsCliente = item.whatsCliente || '';
  el.inpWhatsCliente.value = estado.whatsCliente;
  renderChipsProduto();
  renderSeguradoras();
  renderTelefonesSeguradora();
  // A faixa do topo conta as não conferidas DO PRODUTO ABERTO, e o histórico
  // troca o produto. Sem esta linha, recarregar um cartão de consórcio deixava
  // lá em cima "12 de 14 seguradoras" enquanto o resto da tela já dizia
  // "Administradora" — o número errado, na palavra errada, no aviso que existe
  // justamente para ninguém mandar telefone não conferido.
  renderAvisoExemplo();
  renderFormulario();
  atualizar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  statusEnvio('Cartão carregado. Ajuste a vigência para renovar.');
}

/* ==========================================================================
   Configuração e rascunho
   ========================================================================== */

function lerConfig() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_CONFIG) || '{}');
    return { ...CONFIG_PADRAO, ...salvo, templates: { ...(salvo.templates || {}) } };
  } catch (_) {
    return { ...CONFIG_PADRAO };
  }
}

function salvarConfig() {
  try {
    localStorage.setItem(CHAVE_CONFIG, JSON.stringify(estado.config));
  } catch (_) {
    statusEnvio('Não consegui salvar as configurações — o logo pode estar grande demais.', 'erro');
  }
}

function aplicarConfigNaTela() {
  const c = estado.config;
  document.documentElement.style.setProperty('--marca', c.cor1);
  document.documentElement.style.setProperty('--destaque', c.cor2);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', c.cor1);
  el.topoLogo.innerHTML = '';
  el.topoLogo.classList.toggle('topo__logo--imagem', !!c.logo);
  if (c.logo) {
    const img = document.createElement('img');
    img.src = c.logo;
    img.alt = '';
    el.topoLogo.appendChild(img);
  } else {
    el.topoLogo.textContent = 'A';
  }
}

function salvarRascunho() {
  try {
    localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({
      produtoId: estado.produtoId,
      seguradoraId: estado.seguradoraId,
      dados: estado.dados,
      whatsCliente: estado.whatsCliente
    }));
  } catch (_) { /* rascunho é conveniência, não vale interromper por isso */ }
}

function lerRascunho() {
  try { return JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) || 'null'); } catch (_) { return null; }
}

/* O logo como estava ao abrir Configurações, e qual botão do diálogo foi tocado.
 *
 * O logo era o único campo que Esc e "Fechar" NÃO descartavam: o `change` do
 * arquivo gravava direto no disco, e não havia como voltar atrás — nem o logo
 * anterior existia mais para restaurar. Agora a prévia e o cartão mostram o novo
 * na hora, porque é isso que faz o vendedor decidir, mas o disco só é tocado no
 * Salvar. Fechou sem salvar, volta o de antes. */
let logoAoAbrirConfig = null;
let acaoDoDialogoConfig = '';

function restaurarLogoSeNaoSalvou() {
  const anterior = logoAoAbrirConfig;
  logoAoAbrirConfig = null;
  if (anterior === null || anterior === estado.config.logo) return;
  estado.config.logo = anterior;
  cacheLogo.clear();
  aplicarConfigNaTela();
  atualizar();
}

function abrirConfig() {
  logoAoAbrirConfig = estado.config.logo;
  acaoDoDialogoConfig = '';
  const c = estado.config;
  el.cfgCorretor.value = c.corretor;
  el.cfgWhats.value = c.whatsapp;
  el.cfgTelefone.value = c.telefone;
  el.cfgEmail.value = c.email;
  el.cfgCorretora.value = c.corretora;
  el.cfgSite.value = c.site;
  el.cfgCor1.value = c.cor1;
  el.cfgCor2.value = c.cor2;
  el.cfgFotoNoContato.checked = !!c.fotoNoContato;
  el.cfgLinkMensagem.checked = !!c.linkNaMensagem;
  el.cfgTemplate.value = templateDoProduto(estado.produtoId);
  const produto = produtoAtual();
  el.cfgTemplateAjuda.textContent = produto
    ? `Vale para ${produto.nome}. Campos disponíveis: ${produto.campos.map((x) => '{' + x.id + '}').join(' ')}`
    : '';
  el.cfgLogoPrevia.hidden = !c.logo;
  if (c.logo) el.cfgLogoPrevia.src = c.logo;
  el.dlgConfig.showModal();
}

function salvarDoDialogo() {
  const c = estado.config;
  c.corretor = el.cfgCorretor.value.trim();
  c.whatsapp = formatarTelBR(el.cfgWhats.value);
  c.telefone = formatarTelBR(el.cfgTelefone.value);
  c.email = el.cfgEmail.value.trim();
  c.corretora = el.cfgCorretora.value.trim() || 'Acionar Corretora de Seguros';
  c.site = el.cfgSite.value.trim();
  c.cor1 = el.cfgCor1.value;
  c.cor2 = el.cfgCor2.value;
  c.fotoNoContato = el.cfgFotoNoContato.checked;
  c.linkNaMensagem = el.cfgLinkMensagem.checked;
  const tpl = el.cfgTemplate.value.trim();
  if (estado.produtoId) {
    if (tpl && tpl !== estado.produtos[estado.produtoId].templateNome) {
      c.templates[estado.produtoId] = tpl;
    } else {
      delete c.templates[estado.produtoId];
    }
  }
  // O logo escolhido no diálogo passa a valer agora, e não mais no instante em
  // que o arquivo foi lido.
  logoAoAbrirConfig = null;
  salvarConfig();
  aplicarConfigNaTela();
  atualizar();
  // Aqui, e não só na abertura do app. O aviso de divergência existe para o
  // caso "ele trocou o WhatsApp aqui e a página do link ainda serve o antigo" —
  // e esse caso NASCE neste exato ponto. Rodando só no iniciar(), o vendedor
  // trocava o número, mandava cartões o dia inteiro com o link apontando para o
  // número velho, e só descobria na próxima vez que abrisse o app.
  conferirCorretora();
}

/** Reduz o logo antes de guardar: localStorage tem ~5 MB no total. */
function processarLogo(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('falha na leitura'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('imagem inválida'));
      img.onload = () => {
        // SVG sem width/height no próprio arquivo mede zero em parte dos
        // navegadores. Com o Math.max(1, …) lá embaixo isso virava um logo de
        // 1x1 pixel, gravado sem erro nenhum: o vendedor via a prévia vazia e
        // não tinha como saber o que havia acontecido. Sem medida não há o que
        // reduzir — melhor recusar e dizer o que fazer.
        const largura = img.naturalWidth || img.width;
        const altura = img.naturalHeight || img.height;
        if (!largura || !altura) {
          reject(new Error('imagem sem dimensão'));
          return;
        }
        const lado = 512;
        const escala = Math.min(1, lado / Math.max(largura, altura));
        const w = Math.max(1, Math.round(largura * escala));
        const h = Math.max(1, Math.round(altura * escala));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/png'));
      };
      img.src = String(leitor.result);
    };
    leitor.readAsDataURL(arquivo);
  });
}

/* ==========================================================================
   Início
   ========================================================================== */

/* ==========================================================================
   Editor do catálogo
   ========================================================================== */

const TIPOS_TELEFONE = [
  ['assistencia', 'Assistência / reboque'],
  ['sinistro', 'Aviso de sinistro'],
  ['atendimento', 'Central de atendimento (consórcio)'],
  ['sac', 'SAC'],
  ['whatsapp', 'WhatsApp'],
  ['ouvidoria', 'Ouvidoria'],
  ['outro', 'Outro']
];

// Seguradora sendo editada. null quando a lista está na tela.
let emEdicao = null;

function abrirCatalogo() {
  mostrarListaCatalogo();
  el.dlgCatalogo.showModal();
}

function mostrarListaCatalogo() {
  emEdicao = null;
  el.vistaEditor.hidden = true;
  el.vistaLista.hidden = false;
  renderListaCatalogo();
}

function renderListaCatalogo() {
  el.listaCatalogo.innerHTML = '';

  // O editor mostra TUDO — quem entra aqui pode querer corrigir uma entrada de
  // outro produto sem ter de trocar de produto antes. Mas as do produto aberto
  // vêm primeiro: são 22 no total, e caçar a Porto Seguro Consórcio no meio das
  // seguradoras é o tipo de atrito que faz o cadastro nunca ser conferido.
  const servem = new Set(catalogoDoProduto().map((s) => s.id));
  const lista = estado.seguradoras.slice()
    .sort((a, b) => (servem.has(b.id) ? 1 : 0) - (servem.has(a.id) ? 1 : 0));

  for (const cia of lista) {
    const li = document.createElement('li');
    if (!servem.has(cia.id)) li.classList.add('catalogo__item--outro');

    if (cia.logo) {
      const img = document.createElement('img');
      img.src = cia.logo;
      img.alt = '';
      li.appendChild(img);
    }

    const info = document.createElement('div');
    info.className = 'catalogo__info';
    const nome = document.createElement('div');
    nome.className = 'catalogo__nome';
    nome.textContent = cia.nome;
    const meta = document.createElement('div');
    const qtd = (cia.telefones || []).length;
    meta.className = 'catalogo__meta' + (cia.exemplo ? ' catalogo__meta--exemplo' : '');
    // O adjetivo concorda com o substantivo. Saía "1 telefone — não conferidos",
    // e é a tela onde o vendedor decide em quem confiar: erro de português aqui
    // custa credibilidade no resto do cadastro.
    const s = qtd === 1 ? '' : 's';
    meta.textContent = qtd === 0
      ? 'nenhum telefone cadastrado'
      : `${qtd} telefone${s} ${cia.exemplo ? '— não conferido' : 'conferido'}${s}`;
    info.append(nome, meta);

    // Diz de qual produto é a entrada quando ela não serve o que está aberto.
    // Sem isto, "Porto Seguro" e "Porto Seguro Consórcio" na mesma lista viram
    // duas linhas quase idênticas e ele edita a errada.
    if (!servem.has(cia.id)) {
      const escopo = document.createElement('div');
      escopo.className = 'catalogo__escopo';
      const nomes = (cia.produtos || [])
        .map((p) => estado.produtos?.[p]?.nome)
        .filter(Boolean);
      escopo.textContent = nomes.length ? 'Só para ' + nomes.join(', ') : '';
      if (escopo.textContent) info.appendChild(escopo);
    }

    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'botao';
    editar.textContent = 'Editar';
    editar.addEventListener('click', () => abrirEditorSeguradora(cia.id));

    li.append(info, editar);
    el.listaCatalogo.appendChild(li);
  }

  renderExcluidas();
}

/** Lista as seguradoras do projeto que foram excluídas, com um botão de
 *  restaurar.
 *
 *  Sem isto, excluir era irreversível: a marca de removida ficava gravada e a
 *  única saída era apagar os dados do site — o que levava junto as
 *  configurações e o histórico. Um toque errado custava caro demais. */
function renderExcluidas() {
  const ajustes = lerAjustesCatalogo();
  const excluidas = estado.seguradorasBase.filter((s) => ajustes.removidas.includes(s.id));
  if (!excluidas.length) return;

  const cab = document.createElement('li');
  cab.className = 'catalogo__secao';
  cab.textContent = 'Excluídas por você';
  el.listaCatalogo.appendChild(cab);

  for (const cia of excluidas) {
    const li = document.createElement('li');
    li.className = 'catalogo__item--outro';
    const info = document.createElement('div');
    info.className = 'catalogo__info';
    const nome = document.createElement('div');
    nome.className = 'catalogo__nome';
    nome.textContent = cia.nome;
    const meta = document.createElement('div');
    meta.className = 'catalogo__meta';
    meta.textContent = 'fora da lista';
    info.append(nome, meta);

    const voltar = document.createElement('button');
    voltar.type = 'button';
    voltar.className = 'botao';
    voltar.textContent = 'Restaurar';
    voltar.addEventListener('click', () => {
      const a = lerAjustesCatalogo();
      a.removidas = a.removidas.filter((id) => id !== cia.id);
      if (!salvarAjustesCatalogo(a)) return;
      recarregarCatalogo();
      renderListaCatalogo();
    });

    li.append(info, voltar);
    el.listaCatalogo.appendChild(li);
  }
}

/* As duas famílias do catálogo. Não é uma lista de checkbox por produto porque
 * a escolha real é essa: ou a empresa vende seguro, ou administra consórcio. */
const PRODUTOS_SEGURO = ['auto', 'moto', 'residencial', 'vida', 'empresarial'];

function escopoDeProdutos(produtos) {
  if (!produtos || !produtos.length) return 'todos';
  if (produtos.length === 1 && produtos[0] === 'consorcio') return 'consorcio';
  return 'seguros';
}

function produtosDoEditor() {
  const escolha = el.segProdutos ? el.segProdutos.value : 'todos';
  if (escolha === 'consorcio') return ['consorcio'];
  if (escolha === 'seguros') return PRODUTOS_SEGURO.slice();
  return null;   // null = apagado no merge = aparece em todos
}

/** Compara o que está em Configurações com o que a página pública do link
 *  publica em data/corretora.json.
 *
 *  Os dois existem porque a página é pública e não enxerga o localStorage do
 *  celular do vendedor. O risco é silencioso: ele troca o WhatsApp aqui, o
 *  cartão passa a mostrar o número novo, e o link continua mandando o cliente
 *  para o antigo. Ninguém percebe até alguém ligar para o número errado. */
async function conferirCorretora() {
  if (!estado.config.linkNaMensagem) return;
  try {
    const daPagina = await fetch('data/corretora.json', { cache: 'no-cache' }).then((r) => r.json());
    const c = estado.config;
    const difere = [];
    if (daPagina.whatsapp !== c.whatsapp) difere.push('WhatsApp');
    if (daPagina.telefone !== c.telefone) difere.push('telefone do escritório');
    if (daPagina.nome !== c.corretora) difere.push('nome da corretora');
    if (daPagina.email !== c.email) difere.push('e-mail');
    estado.divergenciaCorretora = difere.join(', ');
    if (difere.length) renderPendencias();
  } catch (_) {
    // Sem rede ou sem o arquivo: não é motivo para atrapalhar quem está
    // montando um cartão. O aviso simplesmente não aparece.
  }
}

function abrirEditorSeguradora(id) {
  const base = id ? estado.seguradoras.find((s) => s.id === id) : null;
  // Cópia profunda: cancelar tem de descartar tudo, inclusive telefones.
  emEdicao = base
    ? JSON.parse(JSON.stringify(base))
    : { id: null, nome: '', site: '', logo: '', exemplo: true, telefones: [] };

  // Guarda o número como estava ao abrir. Se ele mudar o número, a procedência
  // (o "tirei do site") passa a se referir a outro número e é descartada; se
  // não mudar, ela sobrevive à gravação.
  for (const t of emEdicao.telefones) t._numeroOriginal = t.numero;

  el.tituloEditor.textContent = base ? base.nome : 'Nova seguradora';
  el.segNome.value = emEdicao.nome || '';
  el.segSite.value = emEdicao.site || '';
  el.segProdutos.value = escopoDeProdutos(emEdicao.produtos);
  el.segConferido.checked = !emEdicao.exemplo;
  el.segLogo.value = '';
  el.segLogoPrevia.hidden = !emEdicao.logo;
  if (emEdicao.logo) el.segLogoPrevia.src = emEdicao.logo;
  el.btnExcluirSeguradora.hidden = !base;

  renderTelefonesEditor();
  el.vistaLista.hidden = true;
  el.vistaEditor.hidden = false;
  el.dlgCatalogo.scrollTop = 0;
}

function renderTelefonesEditor() {
  el.listaTelefonesEditor.innerHTML = '';
  if (!emEdicao.telefones.length) {
    const vazio = document.createElement('p');
    vazio.className = 'campo__ajuda';
    vazio.textContent = 'Nenhum telefone. Toque em "+ telefone".';
    el.listaTelefonesEditor.appendChild(vazio);
    return;
  }

  emEdicao.telefones.forEach((tel, i) => {
    const bloco = document.createElement('div');
    bloco.className = 'tel-editor';

    const topo = document.createElement('div');
    topo.className = 'tel-editor__topo';
    const num = document.createElement('span');
    num.className = 'tel-editor__num';
    num.textContent = 'Telefone ' + (i + 1);
    const remover = document.createElement('button');
    remover.type = 'button';
    remover.className = 'botao botao--perigo';
    remover.style.margin = '0';
    remover.textContent = 'Remover';
    remover.addEventListener('click', () => {
      emEdicao.telefones.splice(i, 1);
      renderTelefonesEditor();
    });
    topo.append(num, remover);
    bloco.appendChild(topo);

    const campo = (rotulo, valor, aoMudar, ajuda, tipo) => {
      const wrap = document.createElement('label');
      wrap.className = 'campo campo--full';
      const lab = document.createElement('span');
      lab.className = 'campo__label';
      lab.textContent = rotulo;
      const inp = document.createElement('input');
      inp.className = 'campo__input';
      inp.type = tipo || 'text';
      if (tipo === 'tel') inp.inputMode = 'tel';
      inp.value = valor || '';
      inp.addEventListener('input', () => aoMudar(inp.value));
      wrap.append(lab, inp);
      if (ajuda) {
        const a = document.createElement('span');
        a.className = 'campo__ajuda';
        a.textContent = ajuda;
        wrap.appendChild(a);
      }
      bloco.appendChild(wrap);
      return inp;
    };

    // Evidência de onde o número veio, quando ele foi raspado do site da
    // seguradora. Fica no editor para a conferência ser feita sem sair do app —
    // e o aviso é literal porque o texto capturado às vezes se refere a OUTRO
    // número da mesma página.
    if (tel._contexto || tel._fonte) {
      const ev = document.createElement('div');
      ev.className = 'tel-editor__origem';
      const alerta = document.createElement('strong');
      alerta.textContent = 'Não conferido — tirei do site:';
      ev.appendChild(alerta);
      if (tel._contexto) {
        const c = document.createElement('span');
        c.textContent = '“…' + tel._contexto + '”';
        ev.appendChild(c);
      }
      // Só http(s). A procedência vem do catálogo do projeto, mas também de
      // qualquer JSON que o vendedor importe em Backup do catálogo — e um
      // `_fonte` escrito como "javascript:…" viraria código rodando no app com
      // um toque. Endereço que não é http(s) não é fonte: não vira link.
      if (/^https?:\/\//i.test(String(tel._fonte || ''))) {
        const a = document.createElement('a');
        a.href = tel._fonte;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'abrir a página';
        ev.appendChild(a);
      }
      const nota = document.createElement('span');
      nota.className = 'tel-editor__nota';
      nota.textContent = 'O texto acima pode se referir a outro número da mesma página. Confira e ligue.';
      ev.appendChild(nota);
      bloco.appendChild(ev);
    }

    // Aviso vivo sobre número de central (4004, 3003 e parentes).
    //
    // O telParaDiscagem já tira o DDD desses números para o discador não
    // reescrever, mas ele não resolve tudo: o Android faz a própria reescrita ao
    // IMPORTAR o contato, e é aí que 4004 5423 já virou o celular de uma pessoa
    // real, com nome e foto, na agenda de um cliente. Quem sabe se aquele número
    // é central ou fixo de verdade é quem cadastrou, não o app — então aqui o
    // app aponta e explica, e a decisão fica com ele.
    const alertaCentral = document.createElement('div');
    alertaCentral.className = 'tel-editor__central';
    const atualizarAlertaCentral = () => {
      const mostrar = pareceCodigoCurto(tel.numero) && !tel.semTel;
      alertaCentral.hidden = !mostrar;
      if (mostrar) {
        alertaCentral.textContent = 'Este parece número de central (4004, 3003 e afins). '
          + 'O Android reescreve esses números ao salvar o contato, e o resultado já apontou '
          + 'para o celular de uma pessoa de verdade. Se for central, marque a caixa abaixo.';
      }
    };

    const entradaNumero = campo('Número', tel.numero, (v) => {
      tel.numero = v;
      atualizarAlertaCentral();
    }, 'Escreva como você escreveria para um cliente: 0800 701 4120, (11) 3132 1001.', 'tel');
    entradaNumero.insertAdjacentElement('afterend', alertaCentral);
    campo('Rótulo na imagem', tel.rotulo, (v) => { tel.rotulo = v; }, 'Use as palavras da própria seguradora.');
    campo('Rótulo curto na agenda', tel.rotuloCurto, (v) => { tel.rotuloCurto = v; },
      'Vai prefixado com o nome da seguradora. Curto, senão aparece cortado.');

    const wrapTipo = document.createElement('label');
    wrapTipo.className = 'campo campo--full';
    const labTipo = document.createElement('span');
    labTipo.className = 'campo__label';
    labTipo.textContent = 'Tipo (define a ordem no cartão)';
    const sel = document.createElement('select');
    sel.className = 'campo__input';
    for (const [valor, texto] of TIPOS_TELEFONE) {
      const o = document.createElement('option');
      o.value = valor;
      o.textContent = texto;
      sel.appendChild(o);
    }
    sel.value = tel.tipo || 'outro';
    sel.addEventListener('change', () => { tel.tipo = sel.value; });
    wrapTipo.append(labTipo, sel);
    bloco.appendChild(wrapTipo);

    const wrapSem = document.createElement('label');
    wrapSem.className = 'campo campo--full campo--caixa';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!tel.semTel;
    chk.addEventListener('change', () => {
      tel.semTel = chk.checked;
      atualizarAlertaCentral();
    });
    const txt = document.createElement('span');
    const t1 = document.createElement('span');
    t1.className = 'campo__label';
    t1.textContent = 'Não virar telefone clicável';
    const t2 = document.createElement('span');
    t2.className = 'campo__ajuda';
    t2.textContent = 'Marque em números 4004, 3003 e afins: o Android reescreve eles e o '
      + 'resultado pode apontar para outra pessoa. Fica visível na imagem, para digitar à mão.';
    txt.append(t1, t2);
    wrapSem.append(chk, txt);
    bloco.appendChild(wrapSem);

    atualizarAlertaCentral();
    el.listaTelefonesEditor.appendChild(bloco);
  });
}

function salvarSeguradoraDoEditor() {
  const nome = el.segNome.value.trim();
  if (!nome) {
    alert('Dê um nome para a seguradora.');
    return;
  }
  const conferido = el.segConferido.checked;
  const telefones = emEdicao.telefones
    .filter((t) => String(t.numero || '').trim())
    .map((t) => {
      // Sem chave em vez de chave com null: o telefone é gravado inteiro, não
      // como diferença, então null aqui só sujaria a exportação.
      const novo = {
        rotulo: String(t.rotulo || '').trim() || 'Atendimento',
        numero: String(t.numero).trim(),
        tipo: t.tipo || 'outro'
      };
      const curto = String(t.rotuloCurto || '').trim();
      if (curto) novo.rotuloCurto = curto;
      if (t.semTel) novo.semTel = true;
      // A procedência (o bloco vermelho) só some quando ele marcar que ligou,
      // ou quando o próprio número mudar — aí o texto capturado se refere a
      // outro número e vira mentira. Antes ela sumia em QUALQUER gravação:
      // corrigir o site apagava o aviso dos três telefones sem ninguém ter
      // conferido nada, e o vendedor perdia a única pista de onde vieram.
      const numeroIntacto = String(t.numero).trim() === String(t._numeroOriginal ?? t.numero).trim();
      if (!conferido && numeroIntacto) {
        if (t._contexto) novo._contexto = t._contexto;
        if (t._fonte) novo._fonte = t._fonte;
      }
      return novo;
    });

  if (conferido && !telefones.length) {
    alert('Marcou como conferido mas não há telefone nenhum. Cadastre os números primeiro.');
    return;
  }

  const cia = {
    id: emEdicao.id || idNovaSeguradora(nome),
    nome,
    exemplo: !conferido,
    // null e não undefined: JSON.stringify DESCARTA chave com undefined, então
    // "remover o logo" nunca chegava ao disco e ele voltava na recarga. O merge
    // em catalogoEfetivo trata null como apagado.
    logo: emEdicao.logo || null,
    site: el.segSite.value.trim() || null,
    produtos: produtosDoEditor(),
    telefones
  };

  const ajustes = lerAjustesCatalogo();
  const ehDaBase = estado.seguradorasBase.some((s) => s.id === cia.id);
  if (ehDaBase) {
    // Só o que difere da base. Guardando o registro inteiro, uma seguradora
    // editada ficava para sempre imune às correções publicadas no projeto: se
    // eu corrigisse um telefone da Yelum, a cópia local continuaria por cima.
    const delta = soAsDiferencas(cia, estado.seguradorasBase.find((s) => s.id === cia.id));
    // Delta com só o `id` dentro significa "igual à base": não guarda nada, e
    // apaga o que houvesse. Mesma regra do importarCatalogo. Sem isto, abrir e
    // salvar sem mudar nada deixava uma entrada morta no disco para sempre — e
    // uma entrada em `editadas` é o sinal de "o vendedor mexeu aqui".
    if (Object.keys(delta).length > 1) ajustes.editadas[cia.id] = delta;
    else delete ajustes.editadas[cia.id];
  } else {
    const i = ajustes.novas.findIndex((s) => s.id === cia.id);
    if (i >= 0) ajustes.novas[i] = cia;
    else ajustes.novas.push(cia);
  }
  ajustes.removidas = ajustes.removidas.filter((id) => id !== cia.id);
  if (!salvarAjustesCatalogo(ajustes)) return;

  recarregarCatalogo();
  estado.seguradoraId = cia.id;
  el.selSeguradora.value = cia.id;
  renderTelefonesSeguradora();
  atualizar();
  mostrarListaCatalogo();
}

function excluirSeguradoraDoEditor() {
  if (!emEdicao || !emEdicao.id) return;
  if (!confirm(`Excluir "${emEdicao.nome}" do catálogo?`)) return;

  const ajustes = lerAjustesCatalogo();
  delete ajustes.editadas[emEdicao.id];
  ajustes.novas = ajustes.novas.filter((s) => s.id !== emEdicao.id);
  // Tombstone: seguradora da base do projeto precisa ficar marcada como
  // removida, senão volta na próxima abertura.
  if (estado.seguradorasBase.some((s) => s.id === emEdicao.id)) {
    ajustes.removidas.push(emEdicao.id);
  }
  if (!salvarAjustesCatalogo(ajustes)) return;

  recarregarCatalogo();
  mostrarListaCatalogo();
}

function exportarCatalogo() {
  const conteudo = JSON.stringify({
    _origem: 'Exportado do app Cartão Acionar. Substitui data/seguradoras.json.',
    seguradoras: estado.seguradoras
  }, null, 2);
  baixar(new Blob([conteudo], { type: 'application/json' }), 'seguradoras.json');
}

function importarCatalogo(arquivo) {
  const leitor = new FileReader();
  leitor.onload = () => {
    let dados;
    try {
      dados = JSON.parse(String(leitor.result));
    } catch (_) {
      alert('Esse arquivo não é um JSON válido.');
      return;
    }
    const lista = Array.isArray(dados) ? dados : dados.seguradoras;
    if (!Array.isArray(lista) || !lista.length) {
      alert('Não encontrei uma lista de seguradoras nesse arquivo.');
      return;
    }
    if (!confirm(`Importar ${lista.length} seguradoras? Isso substitui o que está cadastrado neste aparelho.`)) return;

    const ajustes = { editadas: {}, novas: [], removidas: [] };
    for (const cia of lista) {
      if (!cia || !cia.id) continue;
      const base = estado.seguradorasBase.find((s) => s.id === cia.id);
      // Só a diferença, pelo mesmo motivo do editor: guardando o registro
      // inteiro, importar um backup deixava as 22 seguradoras imunes para
      // sempre às correções publicadas no projeto. Era o bug que o
      // soAsDiferencas existe para evitar, entrando de novo pela porta do lado.
      if (!base) {
        ajustes.novas.push(cia);
        continue;
      }
      const delta = soAsDiferencas(cia, base);
      // Delta com só o `id` dentro é igual à base: não guarda. Sem isto,
      // importar um backup gravava 22 entradas onde 21 não diziam nada.
      if (Object.keys(delta).length > 1) ajustes.editadas[cia.id] = delta;
    }
    for (const base of estado.seguradorasBase) {
      if (!lista.some((c) => c && c.id === base.id)) ajustes.removidas.push(base.id);
    }
    if (!salvarAjustesCatalogo(ajustes)) return;
    recarregarCatalogo();
    mostrarListaCatalogo();
  };
  leitor.readAsText(arquivo);
}

/* ==========================================================================
   Diagnóstico

   Existe porque eu estava depurando o aparelho do vendedor por descrição e
   captura de tela. Aqui ele lê a versão e o que o navegador sabe fazer, copia
   e manda. Também é como se descobre que o aparelho ficou preso numa versão
   velha: se a versão do app e a do cache não batem, a troca não aconteceu.
   ========================================================================== */

// Service worker novo instalado, esperando permissão para assumir.
let swEsperando = null;

/** Aplica a atualização. O aviso de cima e o botão do diagnóstico chamam a
 *  mesma coisa: o banner fica no topo da página e passa fácil batido quando o
 *  vendedor está rolado até o fim. */
async function aplicarAtualizacao(botao) {
  if (botao) {
    botao.disabled = true;
    botao.textContent = 'Atualizando…';
  }

  // A referência guardada pode ter virado obsoleta (o worker saiu do estado de
  // espera). Busca de novo antes de desistir.
  let alvo = swEsperando;
  if (!alvo && navigator.serviceWorker) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      alvo = (reg && reg.waiting) || null;
    } catch (_) { alvo = null; }
  }

  if (alvo) {
    alvo.postMessage({ tipo: 'ASSUMIR_AGORA' });
    return;
  }

  // Nada esperando: recarrega na força. Botão escrito "Recarregar" tem de
  // recarregar — sair sem fazer nada é o pior resultado possível aqui.
  location.reload();
}

/** Este navegador consegue mandar ESTES arquivos pelo compartilhamento nativo?
 *
 *  Testava um .vcf falso de 1 byte e respondia "sim" enquanto o envio real
 *  falhava com os arquivos de verdade — o diagnóstico contradizia a tela de
 *  erro, e eu fiquei rodadas atrás de um fantasma. Agora usa o cartão atual
 *  quando existe um; o arquivo sintético é só o último recurso. */
function compartilhaArquivos() {
  try {
    if (!navigator.canShare) return false;
    const art = estado.artefatos;
    if (art) {
      const vcf = new File([art.vcfTexto], art.nomeVcf, { type: 'text/vcard' });
      const reais = art.pngBlob
        ? [new File([art.pngBlob], art.nomePng, { type: 'image/png' }), vcf]
        : [vcf];
      if (navigator.canShare({ files: reais })) return true;
      // Par recusado não quer dizer contato recusado.
      return navigator.canShare({ files: [vcf] });
    }
    return navigator.canShare({ files: [new File(['x'], 'teste.vcf', { type: 'text/vcard' })] });
  } catch (_) {
    return false;
  }
}

/** Compara "v39" com "v38". Só serve para versões deste app, que são v + número. */
function maiorQue(a, b) {
  const n = (v) => parseInt(String(v).replace(/^v/, ''), 10);
  const na = n(a);
  const nb = n(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na > nb;
}

async function coletarDiagnostico() {
  let versoes = [];
  let limparEBuscar = false;
  let swEstado = 'não registrado';
  try {
    // Tira o prefixo de CADA cache. Antes usava replace(/^acionar-/) na string
    // já unida, então dois caches saíam como "v5, acionar-v6" — feio e confuso
    // justo na linha que existe para tirar dúvida.
    versoes = (await caches.keys()).map((k) => k.replace(/^acionar-/, ''));
  } catch (_) { /* sem caches em contexto não seguro */ }

  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) {
      // Só ANOTA, nunca apaga. Antes fazia `swEsperando = reg.waiting || null`:
      // abrir o diagnóstico num instante em que reg.waiting estivesse vazio
      // zerava a referência guardada pelo aviso do topo, e o botão Recarregar
      // virava um no-op — o próprio mecanismo de atualização se quebrava.
      if (reg.waiting) swEsperando = reg.waiting;
      swEstado = swEsperando ? 'atualização pronta, é só recarregar' : (reg.active ? 'ativo' : 'instalando');
    }
  } catch (_) { /* idem */ }

  const temAtual = versoes.includes(VERSAO_APP);
  const sobrando = versoes.filter((v) => v !== VERSAO_APP);
  let valorVersoes;
  let estadoVersoes;
  if (!versoes.length) {
    valorVersoes = '(nada guardado ainda)';
    estadoVersoes = null;
  } else if (temAtual && !sobrando.length) {
    valorVersoes = VERSAO_APP;
    estadoVersoes = 'bom';
  } else if (temAtual) {
    valorVersoes = `${VERSAO_APP} (sobrou ${sobrando.join(', ')} da versão anterior)`;
    estadoVersoes = 'bom';
  } else {
    // "Preso na antiga" era impreciso e mandava o vendedor limpar dados do site
    // sem necessidade: o app rodando pode já ser o novo (veio da rede) e só o
    // cache offline estar atrás. O que falta é aplicar a atualização.
    valorVersoes = `cache guardado é ${versoes.join(', ')} — toque em Recarregar`;
    estadoVersoes = 'ruim';
    // Divergência ao contrário: o cache tem um nome MAIS NOVO que o app que
    // está rodando. Isso não é atualização pendente — é cache envenenado, um
    // service worker que se instalou com nome novo e conteúdo velho. Aconteceu
    // de verdade entre a v38 e a v39. Recarregar não resolve, porque o arquivo
    // errado já está guardado; o jeito é apagar e buscar de novo.
    if (versoes.some((v) => maiorQue(v, VERSAO_APP))) {
      valorVersoes = `cache diz ${versoes.join(', ')} mas o app é ${VERSAO_APP}. `
        + 'Recarregar não resolve: o arquivo guardado está errado.';
      limparEBuscar = true;
    }
  }

  const compartilha = compartilhaArquivos();
  return [
    { rot: 'Versão do app', val: VERSAO_APP },
    { rot: 'Versão guardada no aparelho', val: valorVersoes, estado: estadoVersoes, limpar: limparEBuscar },
    { rot: 'Service worker', val: swEstado, acao: !!swEsperando },
    { rot: 'Compartilha arquivos', val: compartilha ? 'sim' : 'NÃO — cai no plano B', estado: compartilha ? 'bom' : 'ruim' },
    { rot: 'Área de transferência', val: navigator.clipboard && navigator.clipboard.writeText ? 'sim' : 'não' },
    { rot: 'Contexto seguro', val: window.isSecureContext ? 'sim' : 'não' },
    { rot: 'Endereço', val: location.origin },
    { rot: 'Navegador', val: navigator.userAgent },
    { rot: 'Último envio', val: registroEnvio.length ? registroEnvio.join('\n') : '(nenhum nesta sessão)' }
  ];
}

/** Saída de emergência para cache envenenado: apaga o service worker e os
 *  arquivos guardados e busca tudo de novo.
 *
 *  NÃO toca no localStorage. É lá que moram o catálogo editado, as
 *  configurações e o histórico — apagar isso para resolver um problema de
 *  cache seria trocar um transtorno por uma perda. */
async function limparCacheEBuscar(botao) {
  if (botao) {
    botao.disabled = true;
    botao.textContent = 'Limpando…';
  }
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch (_) { /* segue: o que importa é apagar o cache */ }
  try {
    const chaves = await caches.keys();
    await Promise.all(chaves.map((c) => caches.delete(c)));
  } catch (_) { /* idem */ }
  // Endereço diferente para o navegador não responder do próprio cache HTTP,
  // que é justamente quem serviu o arquivo velho em primeiro lugar.
  location.replace(location.pathname + '?recarga=' + Date.now());
}

async function renderDiagnostico() {
  const itens = await coletarDiagnostico();
  el.diagLista.innerHTML = '';
  for (const item of itens) {
    const dt = document.createElement('dt');
    dt.textContent = item.rot;
    const dd = document.createElement('dd');
    dd.textContent = item.val;
    if (item.estado) dd.className = item.estado;
    if (item.acao) {
      // Atalho para quem chegou aqui sem ver o aviso lá em cima.
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao diag__acao';
      b.textContent = 'Atualizar agora';
      b.addEventListener('click', () => aplicarAtualizacao(b));
      dd.append(document.createElement('br'), b);
    }
    if (item.limpar) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao diag__acao';
      b.textContent = 'Limpar e buscar de novo';
      b.addEventListener('click', () => limparCacheEBuscar(b));
      dd.append(document.createElement('br'), b);
    }
    el.diagLista.append(dt, dd);
  }
  estado.diagnostico = itens.map((i) => `${i.rot}: ${i.val}`).join('\n');

  const semCompartilhar = itens.some((i) => i.rot === 'Compartilha arquivos' && i.estado === 'ruim');
  // Botão não pode prometer o que este navegador não faz.
  el.btnEnviar.textContent = semCompartilhar ? 'Preparar para o WhatsApp' : '1. Enviar a imagem';
  el.btnContatoDepois.textContent = semCompartilhar ? '3. Baixar o contato' : rotuloPasso3();
}

/** Registro do service worker com caminho de atualização.
 *
 *  `updateViaCache: 'none'` obriga o navegador a revalidar o próprio sw.js em
 *  toda visita. Sem isso ele podia servir o service worker do cache por até
 *  24 h — e um app preso numa versão velha nunca descobre que existe correção.
 *
 *  A troca só acontece no toque do vendedor: assumir sozinho deixaria HTML novo
 *  rodando o JavaScript antigo, ou trocaria a versão no meio de um cartão. */
function registrarServiceWorker() {
  let recarregando = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recarregando) return;
    recarregando = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((registro) => {
      const avisar = (candidato) => {
        if (!candidato) return;
        // Só é atualização se já existia um controlador; senão é a 1ª instalação.
        if (!navigator.serviceWorker.controller) return;
        swEsperando = candidato;
        el.bannerAtualizacao.hidden = false;
        el.btnAtualizar.onclick = () => aplicarAtualizacao(el.btnAtualizar);
      };

      if (registro.waiting) avisar(registro.waiting);

      registro.addEventListener('updatefound', () => {
        const novo = registro.installing;
        if (!novo) return;
        novo.addEventListener('statechange', () => {
          if (novo.state === 'installed') avisar(novo);
        });
      });
    })
    .catch((erro) => console.warn('service worker', erro));
}

function mostrarErroCarregamento() {
  const local = location.protocol === 'file:';
  el.bannerErro.hidden = false;
  el.bannerErro.innerHTML = local
    ? '<strong>Abra por um servidor, não pelo arquivo.</strong> O navegador bloqueia a leitura dos ' +
      'arquivos de dados em <code>file://</code>. Na pasta do projeto, rode um destes e abra o endereço que aparecer:' +
      '<pre>npx serve .</pre><pre>python -m http.server 8000</pre>'
    : '<strong>Não consegui carregar <code>data/produtos.json</code> e <code>data/seguradoras.json</code>.</strong> ' +
      'Confira se as duas pastas subiram junto com o app.';
}

async function iniciar() {
  for (const id of ['bannerExemplo', 'bannerExemploTexto', 'bannerErro', 'bannerAtualizacao',
    'btnAtualizar', 'topoLogo', 'btnConfig',
    'chipsProduto', 'selSeguradora', 'rotuloSeguradora', 'tituloPasso2',
    'listaTelefones', 'formDados', 'inpWhatsCliente',
    'nomeContato', 'pendencias', 'canvasCartao', 'btnEnviar', 'btnMensagem', 'btnVcf', 'btnPng',
    'maisEnvio', 'btnContatoDepois', 'btnMensagemDepois', 'blocoLink', 'linkCliente',
    'btnLimpar', 'statusEnvio', 'listaHistorico', 'btnLimparHistorico',
    'diagnostico', 'diagLista', 'btnCopiarDiag',
    'btnCatalogo', 'btnBannerCatalogo', 'dlgCatalogo', 'vistaLista', 'vistaEditor', 'listaCatalogo',
    'btnNovaSeguradora', 'btnFecharCatalogo', 'btnExportarCatalogo', 'inpImportarCatalogo',
    'tituloEditor', 'segNome', 'segSite', 'segProdutos', 'segLogo', 'segLogoPrevia', 'segLogoRemover',
    'listaTelefonesEditor', 'btnNovoTelefone', 'segConferido', 'btnSalvarSeguradora',
    'btnCancelarSeguradora', 'btnExcluirSeguradora',
    'dlgConfig', 'formConfig', 'cfgCorretor', 'cfgWhats',
    'cfgTelefone', 'cfgEmail', 'cfgCorretora', 'cfgSite', 'cfgCor1', 'cfgCor2',
    'cfgBuscaCodigo', 'cfgBuscarCodigo', 'cfgResultadoCodigo',
    'cfgFotoNoContato', 'cfgLinkMensagem', 'cfgLogo',
    'cfgLogoPrevia', 'cfgLogoRemover', 'cfgTemplate', 'cfgTemplateAjuda']) {
    el[id] = $('#' + id);
    if (!el[id]) elFaltando.push(id);
  }

  // HTML e JavaScript são baixados e guardados em cache separadamente. Numa
  // troca de versão o aparelho pode ficar, por alguns minutos, com o index.html
  // novo e o app.js velho — foi o que aconteceu ao remover o botão "Copiar
  // link": o HTML já não tinha o botão, o JavaScript antigo ainda o procurava,
  // e o `addEventListener` num elemento nulo derrubou TUDO que seria registrado
  // depois. O app abriu pela metade, sem "Copiar mensagem", sem o botão do
  // contato e sem configurações, e nada na tela dizia por quê.
  //
  // Agora falta um elemento e perde-se só o que dependia dele. E o aviso
  // aparece, porque app meio morto sem explicação é pior que app quebrado.
  if (elFaltando.length && el.bannerErro) {
    console.warn('Elementos ausentes (HTML e JS de versões diferentes):', elFaltando);
    el.bannerErro.hidden = false;
    el.bannerErro.innerHTML = '<strong>Atualização incompleta neste aparelho.</strong> '
      + 'O app está usando arquivos de duas versões diferentes. Toque em <strong>Recarregar</strong> '
      + 'na faixa do topo. Se não aparecer a faixa, feche e abra o app de novo.';
  }

  estado.config = lerConfig();
  aplicarConfigNaTela();

  let produtos;
  let seguradoras;
  if (window.DADOS_EMBUTIDOS) {
    // Versão de arquivo único: não há o que buscar na rede.
    produtos = window.DADOS_EMBUTIDOS.produtos;
    seguradoras = window.DADOS_EMBUTIDOS.seguradoras;
  } else {
    try {
      const [rp, rs] = await Promise.all([
        fetch('data/produtos.json', { cache: 'no-cache' }),
        fetch('data/seguradoras.json', { cache: 'no-cache' })
      ]);
      if (!rp.ok || !rs.ok) throw new Error('resposta ' + rp.status + '/' + rs.status);
      produtos = await rp.json();
      seguradoras = await rs.json();
    } catch (erro) {
      console.error(erro);
      mostrarErroCarregamento();
      return;
    }
  }

  estado.produtos = produtos.produtos;
  estado.ordemProdutos = produtos.ordem.filter((id) => estado.produtos[id]);
  estado.produtoId = estado.ordemProdutos[0];
  // Base do projeto separada do efetivo: o editor sobrepõe, não substitui.
  estado.seguradorasBase = seguradoras.seguradoras || [];
  estado.seguradoras = catalogoEfetivo();
  renderAvisoExemplo();

  const rascunho = lerRascunho();
  if (rascunho) {
    if (rascunho.produtoId && estado.produtos[rascunho.produtoId]) estado.produtoId = rascunho.produtoId;
    estado.seguradoraId = rascunho.seguradoraId || null;
    estado.dados = rascunho.dados || {};
    estado.whatsCliente = rascunho.whatsCliente || '';
    el.inpWhatsCliente.value = estado.whatsCliente;
  }

  renderChipsProduto();
  renderSeguradoras();
  renderTelefonesSeguradora();
  renderFormulario();
  renderHistorico();

  el.chipsProduto?.addEventListener('keydown', navegarChips);

  el.selSeguradora?.addEventListener('change', () => {
    estado.seguradoraId = el.selSeguradora.value || null;
    renderTelefonesSeguradora();
    atualizar();
  });

  el.inpWhatsCliente?.addEventListener('input', () => {
    el.inpWhatsCliente.value = formatarTelBR(el.inpWhatsCliente.value);
    estado.whatsCliente = el.inpWhatsCliente.value;
    salvarRascunho();
  });

  el.btnEnviar?.addEventListener('click', () => enviar('png'));
  if (el.btnContatoDepois) el.btnContatoDepois.textContent = rotuloPasso3();

  el.btnMensagem?.addEventListener('click', () => {
    if (!estado.artefatos) return;
    copiar(estado.artefatos.mensagem).then((copiou) => {
      statusEnvio(
        copiou ? 'Mensagem copiada.' : 'Este navegador não deixou copiar. Selecione o texto da prévia à mão.',
        copiou ? 'ok' : 'erro'
      );
    });
  });

  el.btnVcf?.addEventListener('click', () => {
    if (!estado.artefatos) return;
    const a = estado.artefatos;
    baixar(new Blob([a.vcfTexto], { type: 'text/vcard;charset=utf-8' }), a.nomeVcf);
    statusEnvio('Contato baixado.', 'ok');
  });

  el.btnPng?.addEventListener('click', () => {
    if (!estado.artefatos || !estado.artefatos.pngBlob) return;
    baixar(estado.artefatos.pngBlob, estado.artefatos.nomePng);
    statusEnvio('Imagem baixada.', 'ok');
  });

  el.btnLimpar?.addEventListener('click', () => {
    estado.dados = {};
    estado.whatsCliente = '';
    el.inpWhatsCliente.value = '';
    renderFormulario();
    atualizar();
    statusEnvio('Formulário limpo.');
  });

  el.btnMensagemDepois?.addEventListener('click', () => {
    const art = estado.artefatos;
    if (!art) return;
    // Texto puro, sem arquivo: é justamente a mistura dos dois que faz o
    // WhatsApp descartar o anexo no Android. Como mensagem separada ela ainda
    // ganha o cartão de prévia, que legenda de foto não ganha.
    //
    // O share é a PRIMEIRA instrução depois do toque. Qualquer coisa antes
    // consome o gesto do usuário e o navegador recusa com NotAllowedError.
    let promessa;
    try {
      promessa = navigator.share({ text: art.mensagem });
    } catch (erro) {
      semCompartilharTexto(art, erro);
      return;
    }
    promessa
      .then(() => statusEnvio('Mensagem enviada. Agora o passo 3: "'
        + (el.btnContatoDepois ? el.btnContatoDepois.textContent : 'Enviar o contato') + '".', 'ok'))
      .catch((erro) => {
        if (erro && erro.name === 'AbortError') {
          statusEnvio('Envio da mensagem cancelado.');
          return;
        }
        semCompartilharTexto(art, erro);
      });
  });

  el.btnContatoDepois?.addEventListener('click', () => {
    const art = estado.artefatos;
    if (!art) return;
    // Onde o .vcf pode ser compartilhado (iOS), ele vai direto para o WhatsApp;
    // enviar('vcf') já cai sozinho no download se a bandeja recusar.
    if (vcfPodeSerCompartilhado()) {
      enviar('vcf');
      return;
    }
    baixarVcf(art);
    // O aviso de NÃO abrir é o mais importante daqui: abrir o .vcf salva o
    // contato no celular do próprio vendedor e não manda nada para o cliente.
    // Foi o que aconteceu no primeiro teste real.
    statusEnvio('Contato em Downloads. No WhatsApp: clipe 📎 → Documento.', 'ok');
  });

  el.btnLimparHistorico?.addEventListener('click', () => {
    localStorage.removeItem(CHAVE_HISTORICO);
    renderHistorico();
    statusEnvio('Histórico limpo.');
  });

  el.diagnostico?.addEventListener('toggle', () => {
    if (el.diagnostico.open) renderDiagnostico();
  });

  el.btnCopiarDiag?.addEventListener('click', () => {
    copiar(estado.diagnostico || '').then((copiou) => {
      el.btnCopiarDiag.textContent = copiou ? 'Copiado' : 'Não deu para copiar';
      setTimeout(() => { el.btnCopiarDiag.textContent = 'Copiar diagnóstico'; }, 2500);
    });
  });

  /* ---- editor do catálogo ---- */
  el.btnCatalogo?.addEventListener('click', abrirCatalogo);
  el.btnBannerCatalogo?.addEventListener('click', abrirCatalogo);
  el.btnFecharCatalogo?.addEventListener('click', () => el.dlgCatalogo.close());
  el.btnNovaSeguradora?.addEventListener('click', () => abrirEditorSeguradora(null));
  el.btnCancelarSeguradora?.addEventListener('click', mostrarListaCatalogo);
  el.btnSalvarSeguradora?.addEventListener('click', salvarSeguradoraDoEditor);
  el.btnExcluirSeguradora?.addEventListener('click', excluirSeguradoraDoEditor);

  el.btnNovoTelefone?.addEventListener('click', () => {
    emEdicao.telefones.push({ rotulo: '', rotuloCurto: '', numero: '', tipo: 'assistencia' });
    renderTelefonesEditor();
    el.listaTelefonesEditor.lastElementChild.scrollIntoView({ block: 'nearest' });
  });

  el.segLogo?.addEventListener('change', async () => {
    const arquivo = el.segLogo.files && el.segLogo.files[0];
    if (!arquivo || !emEdicao) return;
    try {
      emEdicao.logo = await processarLogo(arquivo);
      el.segLogoPrevia.src = emEdicao.logo;
      el.segLogoPrevia.hidden = false;
    } catch (erro) {
      console.error(erro);
      alert('Não consegui ler essa imagem. Tente um PNG ou JPG.');
    }
  });

  el.segLogoRemover?.addEventListener('click', () => {
    if (!emEdicao) return;
    emEdicao.logo = '';
    el.segLogoPrevia.hidden = true;
    el.segLogo.value = '';
  });

  /* Busca do código de indicação. Só lê o que está neste aparelho — a lista
   * código → nome nunca sai daqui. */
  const buscarCodigo = () => {
    const digitado = String(el.cfgBuscaCodigo.value || '').trim();
    const alvo = el.cfgResultadoCodigo;
    if (!digitado) {
      alvo.textContent = 'Chegou uma mensagem citando um código? Digite aqui para ver de '
        + 'quem é a indicação.';
      return;
    }
    const achado = buscarIndicacao(digitado);
    alvo.textContent = achado
      ? `${achado.codigo} — ${achado.nome} (cartão gerado em ${dataParaBR(achado.em) || achado.em})`
      : `Não achei o código ${digitado.toUpperCase()} neste aparelho. Ele é emitido no `
        + 'celular de quem gerou o cartão: se foi outro vendedor, o código está lá.';
  };
  el.cfgBuscarCodigo?.addEventListener('click', buscarCodigo);
  el.cfgBuscaCodigo?.addEventListener('keydown', (ev) => {
    // Enter dentro de um <dialog> com form envia o formulário e fecha a janela.
    if (ev.key === 'Enter') { ev.preventDefault(); buscarCodigo(); }
  });

  el.btnExportarCatalogo?.addEventListener('click', exportarCatalogo);
  el.inpImportarCatalogo?.addEventListener('change', () => {
    const arquivo = el.inpImportarCatalogo.files && el.inpImportarCatalogo.files[0];
    if (arquivo) importarCatalogo(arquivo);
    el.inpImportarCatalogo.value = '';
  });

  el.btnConfig?.addEventListener('click', abrirConfig);

  // Salva no submit do formulário, não no evento 'close' do <dialog>: o 'close'
  // não dispara em parte dos navegadores e a configuração se perdia calada.
  // Efeito colateral bom: Esc e "Fechar" descartam, que é o esperado.
  //
  // Anota qual botão foi tocado no clique, porque o evento.submitter do submit
  // não existe no Safari abaixo do 15.4 — e sem ele o `botao.value` era
  // undefined, o Salvar não salvava, e nada na tela dizia isso. O clique não
  // depende de recurso novo nenhum.
  for (const b of el.formConfig?.querySelectorAll('button[type="submit"]') || []) {
    b.addEventListener('click', () => {
      acaoDoDialogoConfig = b.value;
      // Fechou sem salvar: o logo escolhido no diálogo não vale mais.
      if (b.value !== 'salvar') restaurarLogoSeNaoSalvou();
    });
  }
  el.formConfig?.addEventListener('submit', (evento) => {
    // Enter dentro de um campo submete sem passar por clique nenhum. Aí vale o
    // padrão do HTML, que é o primeiro botão de submit — o Salvar.
    const acao = (evento.submitter && evento.submitter.value) || acaoDoDialogoConfig || 'salvar';
    acaoDoDialogoConfig = '';
    if (acao === 'salvar') salvarDoDialogo();
  });

  // O Esc não passa por botão nenhum, então precisa do seu próprio caminho.
  //
  // O 'close' e o 'cancel' do <dialog> estão aqui só como reforço, e não como
  // mecanismo: nem todo navegador os dispara — é a mesma razão pela qual a
  // configuração é salva no submit e não no close, registrada no comentário
  // acima. Medi neste navegador: dialog.close() NÃO disparou 'close'. Como
  // restaurarLogoSeNaoSalvou é idempotente, sobrepor os caminhos não faz mal e
  // cobre o navegador que dispara um e não o outro.
  el.dlgConfig?.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') restaurarLogoSeNaoSalvou();
  });
  el.dlgConfig?.addEventListener('close', restaurarLogoSeNaoSalvou);
  el.dlgConfig?.addEventListener('cancel', restaurarLogoSeNaoSalvou);

  el.cfgLogo?.addEventListener('change', async () => {
    const arquivo = el.cfgLogo.files && el.cfgLogo.files[0];
    if (!arquivo) return;
    try {
      // Sem salvarConfig aqui: quem grava é o Salvar. Ver logoAoAbrirConfig.
      estado.config.logo = await processarLogo(arquivo);
      cacheLogo.clear();
      aplicarConfigNaTela();
      el.cfgLogoPrevia.src = estado.config.logo;
      el.cfgLogoPrevia.hidden = false;
      atualizar();
    } catch (erro) {
      console.error(erro);
      statusEnvio('Não consegui ler essa imagem. Tente um PNG ou JPG.', 'erro');
    }
  });

  el.cfgLogoRemover?.addEventListener('click', () => {
    estado.config.logo = '';
    cacheLogo.clear();
    aplicarConfigNaTela();
    el.cfgLogoPrevia.hidden = true;
    atualizar();
  });

  await atualizar();
  // Roda já na abertura: é o que ajusta o rótulo do botão de enviar quando o
  // navegador não anexa arquivos.
  await renderDiagnostico();

  // isSecureContext, não location.protocol: é verdadeiro em https E em
  // http://localhost, que é contexto seguro por especificação. Comparar a
  // string do protocolo deixava o service worker sem registrar em
  // desenvolvimento — ou seja, sem nunca ser testado.
  // O arquivo único não tem sw.js ao lado, então nem tenta registrar.
  if ('serviceWorker' in navigator && window.isSecureContext && !window.DADOS_EMBUTIDOS) {
    registrarServiceWorker();
  }

  // Em segundo plano: não trava a abertura, e o aviso entra nas pendências
  // assim que a resposta chega. No arquivo único não há o que buscar.
  if (!window.DADOS_EMBUTIDOS) conferirCorretora();
}

document.addEventListener('DOMContentLoaded', iniciar);
