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

/** O que vem no endereço: seguradora, produto e o nome do contato, separados
 *  por barra vertical e embrulhados em base64url. Embrulhado por dois motivos:
 *  o endereço fica curto o bastante para caber na mensagem sem virar três
 *  linhas azuis, e a placa do carro não fica legível para quem só recebe o
 *  link encaminhado. */
function lerEndereco() {
  const bruto = (location.hash || '').replace(/^#/, '').trim();
  if (!bruto) return null;
  try {
    const b64 = bruto.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const texto = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const [seguradoraId, produtoId, nome] = texto.split('|');
    if (!seguradoraId) return null;
    return { seguradoraId, produtoId: produtoId || '', nome: nome || '' };
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

  let seguradoras, produtos, corretora;
  try {
    [seguradoras, produtos, corretora] = await Promise.all([
      fetch('../data/seguradoras.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('../data/produtos.json', { cache: 'no-cache' }).then((r) => r.json()),
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
  const produto = (produtos.produtos || {})[pedido.produtoId];

  document.title = (pedido.nome || 'Seus telefones') + ' — ' + (corretora.nome || 'Acionar');
  el('rotulo').textContent = produto ? (produto.rotuloFornecedor || 'Seguradora') + ' · ' + cia.nome : cia.nome;
  el('titulo').textContent = pedido.nome || cia.nome;

  const doSeguro = (cia.telefones || [])
    .filter((t) => t.numero)
    .slice()
    .sort((a, b) => (ORDEM_TIPO[a.tipo] ?? 9) - (ORDEM_TIPO[b.tipo] ?? 9));

  el('tituloTelefones').textContent =
    (produto && produto.tituloTelefones) || 'EM CASO DE SINISTRO OU REBOQUE';
  const destino = el('telefones');
  for (const t of doSeguro) {
    destino.appendChild(cartaoTelefone({
      rotulo: cia.nome + ' — ' + (t.rotuloCurto || t.rotulo),
      numero: t.numero,
      semTel: !!t.semTel
    }));
  }
  el('blocoSeguradora').hidden = doSeguro.length === 0;

  /* ---- a corretora ---- */
  const daCorretora = [];
  if (corretora.whatsapp) {
    daCorretora.push({ rotulo: 'WhatsApp', numero: corretora.whatsapp, movel: true });
  }
  if (corretora.telefone) {
    daCorretora.push({ rotulo: 'Escritório', numero: corretora.telefone, movel: false });
  }
  el('nomeCorretora').textContent = corretora.nome || '';
  for (const t of daCorretora) {
    destinoCorretora(t, corretora);
  }
  el('blocoCorretora').hidden = daCorretora.length === 0;

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
  el('blocoContato').hidden = false;
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
