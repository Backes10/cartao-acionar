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

/** Prefixos de central de atendimento — os "4004 da vida".
 *
 *  Lista fechada e curta de propósito. 3xxx e 4xxx também são prefixos de fixo
 *  de VERDADE: (11) 3789-4000 é um telefone geográfico comum. Alargar isto para
 *  /^[34]\d{3}/ faria o app parar de discar o DDD de um fixo legítimo, que é o
 *  erro na direção oposta. Só entram aqui os prefixos que as centrais brasileiras
 *  realmente usam. */
const PREFIXOS_CENTRAL = /^(3003|3004|4002|4003|4004|4020|4062)\d{4}$/;

/** O número é código de central, com ou sem o DDD que a empresa escreve na
 *  frente? Serve tanto para a discagem quanto para o editor avisar. */
function pareceCodigoCurto(bruto) {
  const d = String(bruto || '').replace(/\D/g, '');
  return PREFIXOS_CENTRAL.test(d.length === 10 ? d.slice(2) : d);
}

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
  if (PREFIXOS_CENTRAL.test(d)) return d;
  // O mesmo código escrito COM o DDD na frente. Este era o buraco: o teste
  // antigo só olhava o começo da string, então "4004 5423" passava e
  // "(11) 4004-5423" caía na regra dos 10 dígitos e saía "+551140045423" — um
  // fixo de São Paulo que pertence a OUTRA PESSOA. Num teste real ela apareceu
  // no contato do cliente com nome e foto. O DDD sai fora porque 4004 não é
  // discado com DDD em lugar nenhum do país.
  if (d.length === 10 && PREFIXOS_CENTRAL.test(d.slice(2))) return d.slice(2);
  if (d.length <= 5) return d;
  if (d.length === 10 || d.length === 11) return '+55' + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return '+' + d;
  return d;
}

/** Número só de dígitos com 55 na frente, para links wa.me.
 *
 *  Devolve vazio para o que não existe no WhatsApp. Sem isso um 0800 virava
 *  "wa.me/5508007721214", que abre conversa com ninguém — e quem clica não sabe
 *  se o problema é o link, o WhatsApp ou o telefone. */
function telParaWaMe(bruto) {
  const d = String(bruto || '').replace(/\D/g, '');
  if (!d) return '';
  if (/^0(800|300|500)/.test(d) || pareceCodigoCurto(d)) return '';
  // Menos de 10 dígitos não é conta de WhatsApp em lugar nenhum do mundo: é
  // código curto (*144), ramal, ou número que ficou pela metade no campo. Sem
  // esta linha caía no `return d` do fim e virava "wa.me/144" — exatamente o
  // link para ninguém que esta função existe para evitar do lado dos 0800.
  if (d.length < 10) return '';
  if (d.length === 10 || d.length === 11) return '55' + d;
  if (d.startsWith('55') && d.length >= 12) return d;
  return d;
}

/** Dois campos apontam para o MESMO telefone?
 *
 *  Compara pela forma discável, não pelo texto: "(51) 3566-0010", "5135660010"
 *  e "+55 51 3566-0010" são o mesmo número escrito de três jeitos.
 *
 *  Existe porque a corretora pode ter UM número só servindo de WhatsApp e de
 *  telefone. Sem esta comparação ele sairia duplicado em quatro lugares — no
 *  rodapé do cartão, no contato que o cliente salva na agenda, na página do
 *  link e na página do QR. */
function mesmoTelefone(a, b) {
  const x = telParaDiscagem(a);
  return !!x && x === telParaDiscagem(b);
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
 *  sem pontuação.
 *
 *  A faixa dos acentos vai em escape Unicode, não nos caracteres crus. Escrita
 *  literal ela some da tela: são combinantes, que se grudam no `[` do editor e
 *  ficam invisíveis. Pior, qualquer ferramenta que normalize o arquivo para NFC
 *  colapsa a faixa e a classe deixa de casar — sem erro nenhum. Aí o acento
 *  sobrevive no nome do arquivo e o iOS recusa o anexo. */
function nomeArquivoSeguro(texto, reserva) {
  const padrao = reserva || 'cartao';
  return String(texto || padrao)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
