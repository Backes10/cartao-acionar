/* Regras compartilhadas entre o app e a página do link.
 *
 * Por que este arquivo existe: estas funções viviam duplicadas em app.js e em
 * t/pagina.js. Na revisão, SETE das oito cópias já tinham divergido — a página
 * havia perdido o tratamento de códigos curtos (*144) no telParaDiscagem, e
 * usava caracteres combinantes literais onde o app usa escape Unicode.
 *
 * Divergência aqui não é estética: é o mesmo telefone formatado de dois jeitos,
 * um no arquivo de contato e outro no botão de ligar. Agora é uma cópia só.
 *
 * Carregado por <script src="comum.js"> antes de app.js, e por
 * <script src="../comum.js"> antes de t/pagina.js. Sem módulos ES de propósito:
 * o build de arquivo único concatena tudo num <script> só, e import/export
 * quebrariam isso.
 */

/** Formato que o discador do aparelho consegue usar.
 *
 *  0800/0300/0500 e 4004/4003/3003/3004 ficam em formato nacional: com +55 na
 *  frente eles simplesmente não completam a ligação. Os demais viram E.164,
 *  que é o que funciona com o cliente viajando ou com chip de outro estado. */
function telParaDiscagem(bruto) {
  const s = String(bruto || '').trim();
  if (!s) return '';
  // Código curto de operadora (*144, #123) vai como está.
  if (/^[*#]/.test(s)) return s.replace(/\s+/g, '');
  const d = s.replace(/\D/g, '');
  if (!d) return '';
  if (/^0(800|300|500)/.test(d)) return d;
  if (/^(3003|3004|4003|4004)/.test(d)) return d;
  if (d.length <= 5) return d;
  if (d.length === 10 || d.length === 11) return '+55' + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return '+' + d;
  return d;
}

/** Número só de dígitos com 55 na frente, para links wa.me. */
function telParaWaMe(bruto) {
  const d = String(bruto || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 || d.length === 11) return '55' + d;
  if (d.startsWith('55') && d.length >= 12) return d;
  return d;
}

/** Escapa o que o vCard trata como separador. */
function escVCard(valor) {
  return String(valor ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Dobra a linha em 75 octetos, como a especificação exige. Sem isso a
 *  importação falha em silêncio em parte dos aparelhos.
 *
 *  O caminho rápido para ASCII existe porque a maioria das linhas é ASCII e
 *  medir byte a byte uma foto em base64 de 14 KB custa caro. */
function dobrarLinha(linha) {
  if (!/[^\x00-\x7F]/.test(linha)) {
    if (linha.length <= 75) return linha;
    const partes = [linha.slice(0, 75)];
    for (let i = 75; i < linha.length; i += 74) partes.push(linha.slice(i, i + 74));
    return partes.join('\r\n ');
  }
  const enc = new TextEncoder();
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
      limite = 74; // a linha de continuação gasta 1 octeto com o espaço
    } else {
      atual += ch;
      bytes += n;
    }
  }
  if (atual) partes.push(atual);
  return partes.join('\r\n ');
}

/** Nome de arquivo que sobrevive a qualquer sistema: sem acento, sem espaço,
 *  sem pontuação. */
function nomeArquivoSeguro(texto, reserva) {
  const padrao = reserva || 'cartao';
  return String(texto || padrao)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || padrao;
}

/** Ordem dos telefones no cartão e na página.
 *
 *  O que vem primeiro é o que o cliente precisa na pior hora. No seguro isso é
 *  assistência e sinistro; no consórcio não existe nenhum dos dois, e o
 *  equivalente é a central que resolve boleto, assembleia e contemplação. */
const ORDEM_TIPO_TELEFONE = {
  assistencia: 0, sinistro: 1, atendimento: 1, sac: 2, whatsapp: 3, ouvidoria: 4, outro: 5
};

function ordenarTelefones(lista) {
  return (lista || [])
    .filter((t) => t && t.numero)
    .slice()
    .sort((a, b) => (ORDEM_TIPO_TELEFONE[a.tipo] ?? 9) - (ORDEM_TIPO_TELEFONE[b.tipo] ?? 9));
}
