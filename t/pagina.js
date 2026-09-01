/* Página do link que vai na mensagem do WhatsApp.
 *
 * Por que ela existe: a imagem do cartão chega como mapa de pixels e não tem
 * camada clicável — nem no Android nem no iOS. Quem está parado no acostamento
 * precisa digitar o número à mão. Aqui cada telefone é um toque, e salvar o
 * contato é um toque.
 *
 * Não há servidor. O que identifica o cartão viaja no fragmento do endereço
 * (depois do #), que o navegador nunca envia para lugar nenhum. Os telefones
 * vêm do mesmo data/seguradoras.json que o app usa, então corrigir um número no
 * cadastro conserta os cartões de todos os clientes de uma vez — inclusive os
 * enviados há dois anos.
 *
 * As regras de discagem, escape e dobra de linha vivem em ../comum.js, junto com
 * o app. Elas já estiveram duplicadas aqui e sete de oito cópias divergiram em
 * poucos dias — a página tinha perdido o tratamento de códigos curtos. */

const el = (id) => document.getElementById(id);

/** O endereço traz só a seguradora: "#yelum".
 *
 *  Antes levava também o produto e o nome do contato, embrulhados em base64. O
 *  resultado ocupava seis linhas de texto azul na conversa — e não servia para
 *  nada, porque o contato personalizado já vai no arquivo .vcf que a corretora
 *  manda em seguida, com nome melhor. Telefone é da seguradora, não da apólice.
 *
 *  Efeito colateral bom: sem o nome, a placa do carro deixa de viajar no link.
 *
 *  A forma antiga (base64 com barras verticais) continua sendo aceita, para não
 *  quebrar link que já tenha sido enviado. */
function lerEndereco() {
  const bruto = decodeURIComponent((location.hash || '').replace(/^#/, '').trim());
  if (!bruto) return null;
  // Sem a bandeira /i de propósito: id de seguradora é sempre minúsculo (o
  // cadastro gera com toLowerCase), e base64 tem maiúsculas. Com /i, um
  // endereço antigo cujo base64 caísse só em letras e números era lido como se
  // fosse um id — e a página dizia que não achou a seguradora.
  if (/^[a-z0-9-]+$/.test(bruto)) return { seguradoraId: bruto, nome: '' };
  try {
    const b64 = bruto.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const texto = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const [seguradoraId, , nome] = texto.split('|');
    if (!seguradoraId) return null;
    return { seguradoraId, nome: nome || '' };
  } catch (_) {
    return null;
  }
}

function mostrarErro(texto) {
  const cabecalho = 'Não consegui abrir este cartão';
  el('titulo').textContent = cabecalho;
  // O arquivo não tem <title> de propósito, para o WhatsApp não montar prévia, e
  // quem preenche isso é o caminho de sucesso. No caminho de erro ninguém
  // preenchia: a aba ficava sem nome nenhum, o que é falha de acessibilidade e
  // deixa o cliente sem saber qual das abas abertas é esta.
  document.title = cabecalho;
  el('erro').hidden = false;
  el('erro').textContent = texto;
}

function cartaoTelefone({ rotulo, numero, semTel, classe, aviso }) {
  const discar = semTel ? '' : telParaDiscagem(numero);
  const no = document.createElement(discar ? 'a' : 'div');
  no.className = 'tel' + (discar ? '' : ' tel--semlink') + (classe ? ' ' + classe : '');
  if (discar) no.href = 'tel:' + discar;

  const rot = document.createElement('span');
  rot.className = 'tel__rot';
  rot.textContent = rotulo;
  const num = document.createElement('span');
  num.className = 'tel__num';
  num.textContent = numero;
  no.append(rot, num);

  if (!discar) {
    // Duas razões diferentes para o número não ser link, e o texto tem de dizer
    // qual é. A de sempre: o Android reescreve 4004/3003 e o resultado já
    // apontou para o celular de uma pessoa real, então melhor digitar à mão. A
    // outra vem por parâmetro — número que ninguém conferiu, onde digitar à mão
    // é justamente o que não se deve fazer.
    const nota = document.createElement('span');
    nota.className = 'tel__aviso';
    nota.textContent = aviso || 'Digite este número no teclado do telefone.';
    no.appendChild(nota);
  }
  return no;
}

function montarVCard(dados) {
  const l = [];
  const add = (linha) => l.push(dobrarLinha(linha));
  add('BEGIN:VCARD');
  add('VERSION:3.0');
  add('N:' + escVCard(dados.nome) + ';;;;');
  add('FN:' + escVCard(dados.nome));
  if (dados.corretora) add('ORG:' + escVCard(dados.corretora));

  for (const t of dados.telefones) {
    if (t.semTel) continue;
    const numero = telParaDiscagem(t.numero);
    if (!numero) continue;
    const rot = t.rotuloAgenda || t.rotulo;
    const i = l.length;
    add(`item${i}.TEL;TYPE=${t.movel ? 'CELL' : 'VOICE'}:${escVCard(numero)}`);
    add(`item${i}.X-ABLabel:${escVCard(rot)}`);
  }
  if (dados.email) add('EMAIL;TYPE=INTERNET:' + escVCard(dados.email));

  const obs = dados.telefones.map(
    (t) => `- ${t.rotuloAgenda || t.rotulo}: ${t.numero}${t.semTel ? ' (digite à mão)' : ''}`
  );
  add('NOTE:' + escVCard([dados.nome, '', 'TELEFONES', ...obs].join('\n')));
  add('END:VCARD');
  return l.join('\r\n') + '\r\n';
}

function baixar(texto, nome) {
  const blob = new Blob([texto], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}


async function iniciar() {
  // As duas buscas partem juntas — quem abre isto pode estar em 3G no
  // acostamento — mas são esperadas SEPARADAS, e não num Promise.all.
  //
  // O Promise.all rejeita junto: se o seguradoras.json falhasse, o corretora.json
  // ia embora com ele mesmo tendo chegado. E é justamente a corretora que
  // sustenta os caminhos de erro aqui embaixo. Cada uma tem seu próprio catch
  // para nenhuma rejeição ficar solta.
  //
  // produtos.json saiu: a página não usa mais nada de lá desde que o cabeçalho
  // de seção e o rótulo "Seguradora/Administradora" foram removidos.
  const buscaCorretora = fetch('../data/corretora.json', { cache: 'no-cache' })
    .then((r) => r.json()).catch(() => ({}));
  const buscaSeguradoras = fetch('../data/seguradoras.json', { cache: 'no-cache' })
    .then((r) => r.json()).catch(() => null);

  const corretora = await buscaCorretora;

  const pedido = lerEndereco();
  if (!pedido) {
    mostrarErro('O endereço veio incompleto. Peça para a sua corretora reenviar o link.');
    mostrarCorretora(corretora);
    return;
  }

  const seguradoras = await buscaSeguradoras;
  if (!seguradoras) {
    mostrarErro('Não consegui carregar os telefones. Confira sua conexão e recarregue a página.');
    mostrarCorretora(corretora);
    return;
  }

  const cia = (seguradoras.seguradoras || []).find((s) => s.id === pedido.seguradoraId);
  if (!cia) {
    mostrarErro('Não encontrei esta seguradora no cadastro. Peça para a sua corretora reenviar.');
    mostrarCorretora(corretora);
    return;
  }
  // O título vem por aqui e não do HTML: sem <title> no arquivo, o robô do
  // WhatsApp não tem o que usar para montar o cartão de prévia acima do link.
  document.title = cia.nome + ' — ' + (corretora.nome || 'Acionar');

  // Caminho relativo ao site; a página mora em /t/. Logo enviado pelo editor
  // vem como data: e é usado como está.
  if (cia.logo) {
    const img = el('logoSeguradora');
    img.src = /^(data:|https?:)/.test(cia.logo) ? cia.logo : '../' + cia.logo;
    img.alt = cia.nome;
    // Logo que não carrega não pode deixar um espaço vazio no lugar do nome.
    img.onerror = () => { img.hidden = true; };
    img.hidden = false;
  }
  el('titulo').textContent = pedido.nome || cia.nome;

  const doSeguro = ordenarTelefones(cia.telefones);

  /* ---- telefones ainda não conferidos ----
   *
   *  Esta página não sabia o que era EXEMPLO, e era o único lugar onde isso
   *  importava de verdade. A imagem do cartão sai riscada, o arquivo do contato
   *  vem com EXEMPLO- no nome e as observações dizem "NÃO USE" — e aqui, que é
   *  onde o cliente TOCA com o dedo, o 0800 000 0001 aparecia como
   *  "Assistência 24h / Reboque", clicável, com um botão grande oferecendo
   *  salvar tudo na agenda dele.
   *
   *  Agora: aviso em cima, números visíveis mas sem link, e o botão de salvar
   *  fora do ar. Os telefones da corretora continuam clicáveis logo abaixo, que
   *  é para onde este cliente deve ligar. */
  const naoConferido = !!cia.exemplo;
  if (naoConferido) {
    const av = el('naoConferido');
    const forte = document.createElement('strong');
    forte.textContent = 'Estes telefones ainda não foram conferidos.';
    const texto = document.createElement('span');
    texto.textContent = 'Não ligue por eles. Fale com a sua corretora nos números '
      + 'no fim desta página — ela confirma o telefone certo da ' + cia.nome + ' na hora.';
    av.append(forte, texto);
    av.hidden = false;
  }

  // Sem cabeçalho de seção: o rótulo de cada telefone já começa com o nome da
  // seguradora, então uma linha em cima dizendo a mesma coisa era repetição.
  const destino = el('telefones');
  for (const t of doSeguro) {
    destino.appendChild(cartaoTelefone({
      rotulo: cia.nome + ' — ' + (t.rotuloCurto || t.rotulo),
      numero: t.numero,
      semTel: naoConferido || !!t.semTel,
      aviso: naoConferido ? 'Número não conferido — confirme com a corretora antes de ligar.' : ''
    }));
  }

  /* ---- a corretora ---- */
  const daCorretora = mostrarCorretora(corretora);

  /* ---- salvar contato ---- */
  const paraContato = [
    ...doSeguro.map((t) => ({
      rotulo: cia.nome + ' ' + (t.rotuloCurto || t.rotulo),
      rotuloAgenda: cia.nome + ' ' + (t.rotuloCurto || t.rotulo),
      numero: t.numero,
      semTel: !!t.semTel,
      // Mesma regra do app: 0800 com `tipo: whatsapp` no catálogo não vira
      // CELL no contato. Ver o comentário em montarCartao().
      movel: t.tipo === 'whatsapp' && !!telParaWaMe(t.numero)
    })),
    ...daCorretora.map((t) => ({
      rotulo: 'Acionar ' + t.rotulo,
      rotuloAgenda: 'Acionar ' + t.rotulo,
      numero: t.numero,
      movel: t.movel
    }))
  ];
  const nome = pedido.nome || (cia.nome + ' — telefones');
  el('btnContato').addEventListener('click', () => {
    baixar(montarVCard({
      nome,
      corretora: corretora.nome,
      email: corretora.email,
      telefones: paraContato
    }), nomeArquivoSeguro(nome, 'contato') + '.vcf');
  });
  // Telefone não conferido não entra na agenda do cliente. Contato salvo é o que
  // sobrevive: ele vai procurar "seguro" no telefone dentro de um ano, achar o
  // número errado e discar sem desconfiar de nada. Enquanto ninguém ligou para
  // confirmar, esse botão não existe.
  el('btnContato').hidden = naoConferido;

  /* ---- ressalva ----
   *  O endereço não carrega o produto, mas o catálogo diz a que família a
   *  empresa pertence — e é isso que decide a palavra: consórcio não tem
   *  apólice, tem contrato. Assim a frase sai certa sem alongar o link. */
  const ehConsorcio = Array.isArray(cia.produtos)
    && cia.produtos.length === 1 && cia.produtos[0] === 'consorcio';
  const doc = ehConsorcio ? 'no contrato do consórcio' : 'na apólice';
  const res = el('ressalva');
  res.textContent = 'Estes telefones são um resumo mantido pela sua corretora. '
    + 'Coberturas, prazos e demais condições são as que constam ' + doc + ' — '
    + 'em caso de divergência, vale o documento.';
  res.hidden = false;
}

/** Os telefones da corretora — em TODOS os caminhos, inclusive os de erro.
 *
 *  Quem cai numa tela de erro aqui é o cliente mais encalhado dos três: link
 *  truncado no encaminhamento, seguradora que saiu do catálogo, arquivo que não
 *  chegou. A tela mandava ele "pedir para a corretora reenviar o link" e não
 *  dava um telefone dela — nem o WhatsApp, nem o escritório. Pedir para falar
 *  com alguém sem dizer como é o mesmo que não dizer nada.
 *
 *  É o princípio que a página já aplicava no aviso de telefone não conferido:
 *  os números da Acionar continuam à mão, porque é para lá que este cliente
 *  deve ligar. Faltava valer também quando a página não abre.
 *
 *  Devolve a lista porque o botão de salvar na agenda monta o contato com ela. */
function mostrarCorretora(corretora) {
  if (!corretora) return [];

  /* Duas listas, e não uma, porque tela e agenda querem coisas diferentes
   * quando o WhatsApp e o telefone são o MESMO número — o caso da Acionar, que
   * atende no fixo do escritório pelos dois.
   *
   * Na TELA valem os dois: tocar num abre a conversa, no outro disca, e são
   * ações diferentes para quem está parado no acostamento. Os rótulos passam a
   * nomear a ação e não a linha, senão o cliente lê "Escritório" duas vezes com
   * o mesmo número e não sabe o que muda.
   *
   * Na AGENDA vale um só. Dois contatos com o número idêntico é lixo no
   * telefone de quem recebeu, e foi o que este projeto passou a evitar em todo
   * lugar depois que o cartão começou a repetir número. */
  const umSoNumero = mesmoTelefone(corretora.whatsapp, corretora.telefone);
  const naTela = [];
  const naAgenda = [];

  if (umSoNumero) {
    naTela.push({ rotulo: 'WhatsApp', numero: corretora.whatsapp, movel: true });
    naTela.push({ rotulo: 'Ligar', numero: corretora.telefone, movel: false });
    naAgenda.push({
      rotulo: 'WhatsApp e telefone',
      rotuloAgenda: 'Acionar WhatsApp e telefone',
      numero: corretora.whatsapp,
      movel: false
    });
  } else {
    if (corretora.whatsapp) naTela.push({ rotulo: 'WhatsApp', numero: corretora.whatsapp, movel: true });
    if (corretora.telefone) naTela.push({ rotulo: 'Escritório', numero: corretora.telefone, movel: false });
    naAgenda.push(...naTela);
  }

  for (const t of naTela) destinoCorretora(t, corretora);
  return naAgenda;
}

function destinoCorretora(t, corretora) {
  const alvo = el('telefonesCorretora');
  if (t.movel && telParaWaMe(t.numero)) {
    const a = document.createElement('a');
    a.className = 'tel';
    a.href = 'https://wa.me/' + telParaWaMe(t.numero);
    a.rel = 'noopener';
    const rot = document.createElement('span');
    rot.className = 'tel__rot';
    rot.textContent = (corretora.nome || 'Acionar').split(' ')[0] + ' — ' + t.rotulo;
    const num = document.createElement('span');
    num.className = 'tel__num';
    num.textContent = t.numero;
    a.append(rot, num);
    alvo.appendChild(a);
    return;
  }
  alvo.appendChild(cartaoTelefone({
    rotulo: (corretora.nome || 'Acionar').split(' ')[0] + ' — ' + t.rotulo,
    numero: t.numero
  }));
}

window.addEventListener('hashchange', () => location.reload());
iniciar();
