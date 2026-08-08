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
 * ATENÇÃO — duplicação conhecida: telParaDiscagem, escVCard e o montador de
 * vCard são espelhos do app.js. Se a regra de discagem mudar lá, mude aqui. Foi
 * uma escolha para manter esta página testável sem mexer no caminho do .vcf que
 * já está validado no celular; se o link vingar, o certo é extrair os dois para
 * um arquivo comum. */

const el = (id) => document.getElementById(id);

/* ---- espelho de app.js: números brasileiros que não aceitam +55 ---- */
function telParaDiscagem(bruto) {
  const s = String(bruto || '').trim();
  if (!s) return '';
  const d = s.replace(/\D/g, '');
  if (!d) return '';
  if (/^0(800|300|500)/.test(d)) return d;
  if (/^(3003|3004|4003|4004)/.test(d)) return d;
  if (d.length <= 5) return d;
  if (d.length === 10 || d.length === 11) return '+55' + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return '+' + d;
  return d;
}

function telParaWaMe(bruto) {
  const d = String(bruto || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 || d.length === 11) return '55' + d;
  if (d.startsWith('55') && d.length >= 12) return d;
  return d;
}

/* ---- espelho de app.js ---- */
function escVCard(v) {
  return String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function dobrarLinha(linha) {
  const enc = new TextEncoder();
  if (enc.encode(linha).length <= 75) return linha;
  const partes = [];
  let atual = '';
  let bytes = 0;
  let limite = 75;
  for (const ch of linha) {
    const n = enc.encode(ch).length;
    if (bytes + n > limite) {
      partes.push(atual);
      atual = ch;
      bytes = n;
      limite = 74;
    } else {
      atual += ch;
      bytes += n;
    }
  }
  if (atual) partes.push(atual);
  return partes.join('\r\n ');
}

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
  el('titulo').textContent = 'Não consegui abrir este cartão';
  el('erro').hidden = false;
  el('erro').textContent = texto;
}

function cartaoTelefone({ rotulo, numero, semTel, classe }) {
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
    // Mesma razão do semTel no app: o Android reescreve 4004/3003 e o número
    // resultante já apontou para o celular de uma pessoa real. Melhor o cliente
    // digitar do que ligar para a pessoa errada.
    const aviso = document.createElement('span');
    aviso.className = 'tel__aviso';
    aviso.textContent = 'Digite este número no teclado do telefone.';
    no.appendChild(aviso);
  }
  return no;
}

const ORDEM_TIPO = {
  assistencia: 0, sinistro: 1, atendimento: 1, sac: 2, whatsapp: 3, ouvidoria: 4, outro: 5
};

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

function nomeArquivoSeguro(nome) {
  return String(nome || 'contato')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'contato';
}

async function iniciar() {
  const pedido = lerEndereco();
  if (!pedido) {
    mostrarErro('O endereço veio incompleto. Peça para a sua corretora reenviar o link.');
    return;
  }

  // produtos.json saiu: a página não usa mais nada de lá desde que o cabeçalho
  // de seção e o rótulo "Seguradora/Administradora" foram removidos.
  let seguradoras, corretora;
  try {
    [seguradoras, corretora] = await Promise.all([
      fetch('../data/seguradoras.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('../data/corretora.json', { cache: 'no-cache' }).then((r) => r.json())
    ]);
  } catch (_) {
    mostrarErro('Não consegui carregar os telefones. Confira sua conexão e recarregue a página.');
    return;
  }

  const cia = (seguradoras.seguradoras || []).find((s) => s.id === pedido.seguradoraId);
  if (!cia) {
    mostrarErro('Não encontrei esta seguradora no cadastro. Peça para a sua corretora reenviar.');
    return;
  }
  document.title = cia.nome + ' — ' + (corretora.nome || 'Acionar');
  el('titulo').textContent = pedido.nome || cia.nome;

  const doSeguro = (cia.telefones || [])
    .filter((t) => t.numero)
    .slice()
    .sort((a, b) => (ORDEM_TIPO[a.tipo] ?? 9) - (ORDEM_TIPO[b.tipo] ?? 9));

  // Sem cabeçalho de seção: o rótulo de cada telefone já começa com o nome da
  // seguradora, então uma linha em cima dizendo a mesma coisa era repetição.
  const destino = el('telefones');
  for (const t of doSeguro) {
    destino.appendChild(cartaoTelefone({
      rotulo: cia.nome + ' — ' + (t.rotuloCurto || t.rotulo),
      numero: t.numero,
      semTel: !!t.semTel
    }));
  }

  /* ---- a corretora ---- */
  const daCorretora = [];
  if (corretora.whatsapp) {
    daCorretora.push({ rotulo: 'WhatsApp', numero: corretora.whatsapp, movel: true });
  }
  if (corretora.telefone) {
    daCorretora.push({ rotulo: 'Escritório', numero: corretora.telefone, movel: false });
  }
  for (const t of daCorretora) {
    destinoCorretora(t, corretora);
  }

  /* ---- salvar contato ---- */
  const paraContato = [
    ...doSeguro.map((t) => ({
      rotulo: cia.nome + ' ' + (t.rotuloCurto || t.rotulo),
      rotuloAgenda: cia.nome + ' ' + (t.rotuloCurto || t.rotulo),
      numero: t.numero,
      semTel: !!t.semTel,
      movel: t.tipo === 'whatsapp'
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
    }), nomeArquivoSeguro(nome) + '.vcf');
  });
  el('btnContato').hidden = false;
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
