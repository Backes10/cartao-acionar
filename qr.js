/* Gerador de QR code, em JavaScript puro e sem dependência nenhuma.
 *
 * Por que escrever isto em vez de puxar uma biblioteca: o app inteiro não usa
 * nenhum pacote de terceiros e funciona sem internet — é PWA e roda no
 * acostamento. Buscar um gerador de QR de fora quebraria as duas coisas e ainda
 * deixaria o cartão do cliente dependendo de um site alheio continuar no ar.
 * O cartão é congelado: fica anos no celular de quem recebeu.
 *
 * Cobre as versões 1 a 10 em modo byte, que vão até 213 bytes no nível M. O
 * endereço que este projeto codifica tem ~50 caracteres e cabe na versão 3.
 * Versão acima de 10 não foi implementada porque exigiria as tabelas das 30
 * versões restantes para um caso que não existe aqui — e tabela grande copiada
 * à mão é fonte de erro silencioso. Se um dia precisar, `escolherVersao` avisa
 * em vez de gerar um código torto.
 *
 * Conferido matriz a matriz contra a biblioteca `segno`, em 4 níveis × 10
 * versões × vários comprimentos. Ver `fontes/conferir-qr.py`.
 */

/* Total de codewords (dados + correção) por versão, 1 a 10. */
const QR_TOTAL = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/* Por nível e versão: [correção por bloco, blocos do grupo 1, dados por bloco
 * do grupo 1, blocos do grupo 2, dados por bloco do grupo 2].
 *
 * Os dois grupos existem porque nem sempre os dados dividem igual entre os
 * blocos: o grupo 2, quando existe, tem exatamente um codeword de dados a mais
 * por bloco. */
const QR_BLOCOS = {
  L: [[7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0],
      [26, 1, 108, 0, 0], [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0],
      [30, 2, 116, 0, 0], [18, 2, 68, 2, 69]],
  M: [[10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0],
      [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39],
      [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]],
  Q: [[13, 1, 13, 0, 0], [22, 1, 22, 0, 0], [18, 2, 17, 0, 0], [26, 2, 24, 0, 0],
      [18, 2, 15, 2, 16], [24, 4, 19, 0, 0], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19],
      [20, 4, 16, 4, 17], [24, 6, 19, 2, 20]],
  H: [[17, 1, 9, 0, 0], [28, 1, 16, 0, 0], [22, 2, 13, 0, 0], [16, 4, 9, 0, 0],
      [22, 2, 11, 2, 12], [28, 4, 15, 0, 0], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15],
      [24, 4, 12, 4, 13], [28, 6, 15, 2, 16]]
};

/* Centros dos padrões de alinhamento. O da versão 1 é vazio: ela não tem. */
const QR_ALINHAMENTO = [[], [6, 18], [6, 22], [6, 26], [6, 30],
                        [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

/* Bits do nível na informação de formato. Não é a ordem alfabética nem a ordem
 * de robustez — é a tabela da norma, e trocar dois deles gera um código que
 * nenhum leitor abre. */
const QR_NIVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/* ---------------------------------------------------------------- GF(256) */
/* Aritmética do corpo finito usada pela correção de erro Reed-Solomon.
 * O polinômio é 0x11D, fixado pela norma do QR. */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
}());

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Polinômio gerador de grau `grau`, base da correção de erro. */
function qrGerador(grau) {
  let p = [1];
  for (let i = 0; i < grau; i += 1) {
    const novo = new Array(p.length + 1).fill(0);
    for (let j = 0; j < p.length; j += 1) {
      novo[j] ^= p[j];
      novo[j + 1] ^= gfMul(p[j], GF_EXP[i]);
    }
    p = novo;
  }
  return p;
}

/** Os codewords de correção de um bloco: o resto da divisão polinomial. */
function qrCorrecao(dados, grau) {
  const ger = qrGerador(grau);
  const resto = new Array(dados.length + grau).fill(0);
  for (let i = 0; i < dados.length; i += 1) resto[i] = dados[i];
  for (let i = 0; i < dados.length; i += 1) {
    const guia = resto[i];
    if (!guia) continue;
    for (let j = 0; j < ger.length; j += 1) resto[i + j] ^= gfMul(ger[j], guia);
  }
  return resto.slice(dados.length);
}

/* ------------------------------------------------------------- codificação */

/** Quantos codewords de dados cabem nesta versão e nível. */
function qrCapacidade(versao, nivel) {
  const [ec, b1, d1, b2, d2] = QR_BLOCOS[nivel][versao - 1];
  return b1 * d1 + b2 * d2;
}

/** A menor versão que comporta os bytes. Devolve 0 quando não cabe em nenhuma.
 *
 *  O indicador de quantidade muda de 8 para 16 bits a partir da versão 10, e
 *  por isso o cabeçalho entra na conta versão a versão em vez de uma vez só. */
function qrEscolherVersao(bytes, nivel) {
  for (let v = 1; v <= 10; v += 1) {
    const cabecalho = 4 + (v >= 10 ? 16 : 8);
    if (cabecalho + bytes.length * 8 <= qrCapacidade(v, nivel) * 8) return v;
  }
  return 0;
}

/** Monta os codewords de dados: cabeçalho, conteúdo, terminador e enchimento. */
function qrCodewordsDados(bytes, versao, nivel) {
  const capacidade = qrCapacidade(versao, nivel);
  const bits = [];
  const push = (valor, quantos) => {
    for (let i = quantos - 1; i >= 0; i -= 1) bits.push((valor >> i) & 1);
  };

  push(0b0100, 4);                                  // modo byte
  push(bytes.length, versao >= 10 ? 16 : 8);
  for (const b of bytes) push(b, 8);

  // Terminador: até quatro zeros, e só o que couber.
  const sobra = capacidade * 8 - bits.length;
  push(0, Math.min(4, sobra));
  while (bits.length % 8) bits.push(0);

  const saida = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    saida.push(byte);
  }
  // Enchimento alternado, fixado pela norma. Não é aleatório nem zero: os dois
  // valores se alternam para não formar um padrão que atrapalhe a leitura.
  const ENCHIMENTO = [0xEC, 0x11];
  for (let i = 0; saida.length < capacidade; i += 1) saida.push(ENCHIMENTO[i % 2]);
  return saida;
}

/** Divide em blocos, calcula a correção de cada um e intercala tudo.
 *
 *  A intercalação é o que torna o QR resistente a um borrão localizado: bytes
 *  vizinhos na imagem pertencem a blocos diferentes, então uma mancha estraga
 *  poucos bytes de cada bloco em vez de destruir um bloco inteiro. */
function qrCodewordsFinais(dados, versao, nivel) {
  const [grauEC, b1, d1, b2, d2] = QR_BLOCOS[nivel][versao - 1];
  const blocos = [];
  let pos = 0;
  for (let i = 0; i < b1; i += 1) { blocos.push(dados.slice(pos, pos + d1)); pos += d1; }
  for (let i = 0; i < b2; i += 1) { blocos.push(dados.slice(pos, pos + d2)); pos += d2; }
  const correcoes = blocos.map((b) => qrCorrecao(b, grauEC));

  const saida = [];
  const maiorDados = Math.max(...blocos.map((b) => b.length));
  for (let i = 0; i < maiorDados; i += 1) {
    for (const b of blocos) if (i < b.length) saida.push(b[i]);
  }
  for (let i = 0; i < grauEC; i += 1) {
    for (const c of correcoes) saida.push(c[i]);
  }
  return saida;
}

/* ----------------------------------------------------------------- matriz */

/** Informação de formato: nível e máscara, protegidos por BCH(15,5). */
function qrFormato(nivel, mascara) {
  const dados = (QR_NIVEL_BITS[nivel] << 3) | mascara;
  let resto = dados << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((resto >> i) & 1) resto ^= 0x537 << (i - 10);
  }
  // A máscara final impede que um formato todo zerado vire uma faixa lisa, que
  // o leitor confundiria com área clara.
  return ((dados << 10) | resto) ^ 0x5412;
}

/** Informação de versão, só da versão 7 em diante: BCH(18,6). */
function qrInfoVersao(versao) {
  let resto = versao << 12;
  for (let i = 17; i >= 12; i -= 1) {
    if ((resto >> i) & 1) resto ^= 0x1F25 << (i - 12);
  }
  return (versao << 12) | resto;
}

function qrNovaMatriz(lado) {
  const m = [];
  for (let i = 0; i < lado; i += 1) m.push(new Int8Array(lado).fill(-1));
  return m;
}

/** Desenha tudo que não são dados: localizadores, tempo, alinhamento e reservas.
 *
 *  Marca as células com 0/1; o que ficar em -1 é onde os dados entram. */
function qrPadroes(m, versao) {
  const lado = m.length;
  const por = (x, y, v) => { if (x >= 0 && y >= 0 && x < lado && y < lado) m[y][x] = v; };

  // Localizadores nos três cantos, com o separador claro em volta.
  for (const [cx, cy] of [[0, 0], [lado - 7, 0], [0, lado - 7]]) {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const dentro = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const anel = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const miolo = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        por(cx + dx, cy + dy, dentro && (anel || miolo) ? 1 : 0);
      }
    }
  }

  // Linhas de tempo: alternadas, dão a régua que o leitor usa para achar as
  // células quando a foto está torta.
  for (let i = 8; i < lado - 8; i += 1) {
    m[6][i] = i % 2 === 0 ? 1 : 0;
    m[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Alinhamento, menos onde colidiria com um localizador.
  const centros = QR_ALINHAMENTO[versao - 1];
  for (const cy of centros) {
    for (const cx of centros) {
      const perto = (cx < 8 && cy < 8) || (cx < 8 && cy > lado - 9) || (cx > lado - 9 && cy < 8);
      if (perto) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const borda = Math.max(Math.abs(dx), Math.abs(dy));
          por(cx + dx, cy + dy, borda === 1 ? 0 : 1);
        }
      }
    }
  }

  // Módulo escuro, sempre aceso, sempre aqui.
  m[lado - 8][8] = 1;

  // Reserva das áreas de formato: zero por enquanto, preenchidas depois de
  // escolhida a máscara.
  for (let i = 0; i < 9; i += 1) {
    if (m[8][i] === -1) m[8][i] = 0;
    if (m[i][8] === -1) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i += 1) {
    if (m[8][lado - 1 - i] === -1) m[8][lado - 1 - i] = 0;
    if (m[lado - 1 - i][8] === -1) m[lado - 1 - i][8] = 0;
  }

  if (versao >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const y = Math.floor(i / 3);
      const x = lado - 11 + (i % 3);
      m[y][x] = 0;
      m[x][y] = 0;
    }
  }
}

/** Percorre a matriz em ziguezague, de baixo para cima, e larga os bits. */
function qrEscreverDados(m, codewords) {
  const lado = m.length;
  let bit = 0;
  const total = codewords.length * 8;
  let subindo = true;

  for (let dir = lado - 1; dir > 0; dir -= 2) {
    // A coluna 6 é a linha de tempo vertical: o ziguezague pula por cima dela.
    const col = dir <= 6 ? dir - 1 : dir;
    for (let passo = 0; passo < lado; passo += 1) {
      const y = subindo ? lado - 1 - passo : passo;
      for (const x of [col, col - 1]) {
        if (m[y][x] !== -1) continue;
        let v = 0;
        if (bit < total) v = (codewords[bit >> 3] >> (7 - (bit & 7))) & 1;
        m[y][x] = v;
        bit += 1;
      }
    }
    subindo = !subindo;
  }
}

/** As oito máscaras da norma. Aplicadas só onde há dados. */
function qrMascara(n, x, y) {
  switch (n) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** Nota de feiura da matriz. A norma manda escolher a máscara de menor nota:
 *  são os padrões que confundem o leitor — faixas longas de uma cor, blocos
 *  2x2, sequências parecidas com o localizador e desequilíbrio claro/escuro. */
function qrPenalidade(m) {
  const lado = m.length;
  let nota = 0;

  // Regra 1: cinco ou mais iguais em sequência.
  for (let i = 0; i < lado; i += 1) {
    for (const linha of [true, false]) {
      let corrida = 1;
      for (let j = 1; j < lado; j += 1) {
        const a = linha ? m[i][j] : m[j][i];
        const b = linha ? m[i][j - 1] : m[j - 1][i];
        if (a === b) {
          corrida += 1;
        } else {
          if (corrida >= 5) nota += corrida - 2;
          corrida = 1;
        }
      }
      if (corrida >= 5) nota += corrida - 2;
    }
  }

  // Regra 2: cada bloco 2x2 de uma cor só.
  for (let y = 0; y < lado - 1; y += 1) {
    for (let x = 0; x < lado - 1; x += 1) {
      const v = m[y][x];
      if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) nota += 3;
    }
  }

  // Regra 3: o desenho 1:1:3:1:1 com uma área clara de quatro módulos de um
  // dos lados — é o mesmo formato do localizador, e faz o leitor procurar um
  // canto que não existe.
  //
  // A área clara pode ficar PARA FORA do símbolo: um padrão colado na margem
  // conta, porque a zona de silêncio em volta do código é clara. Exigir os
  // quatro módulos dentro da matriz faz a regra quase nunca disparar, a nota
  // desabar e a escolha da máscara sair errada — foi o defeito da primeira
  // versão daqui, e o resultado foi um QR válido pela norma que o
  // decodificador do OpenCV não conseguia ler.
  const ALVO = [1, 0, 1, 1, 1, 0, 1];
  const leitura = (linha, i, j) => (linha ? m[i][j] : m[j][i]);
  const claroNoTrecho = (linha, i, de, ate) => {
    for (let k = Math.max(de, 0); k < Math.min(ate, lado); k += 1) {
      if (leitura(linha, i, k)) return false;
    }
    return true;
  };
  for (let i = 0; i < lado; i += 1) {
    for (let j = 0; j + 7 <= lado; j += 1) {
      for (const linha of [true, false]) {
        let bate = true;
        for (let k = 0; k < 7 && bate; k += 1) {
          if (leitura(linha, i, j + k) !== ALVO[k]) bate = false;
        }
        if (!bate) continue;
        if (claroNoTrecho(linha, i, j - 4, j) || claroNoTrecho(linha, i, j + 7, j + 11)) {
          nota += 40;
        }
      }
    }
  }

  // Regra 4: quanto o preenchimento se afasta de metade escuro.
  let escuros = 0;
  for (let y = 0; y < lado; y += 1) for (let x = 0; x < lado; x += 1) escuros += m[y][x];
  const proporcao = (escuros * 100) / (lado * lado);
  nota += Math.floor(Math.abs(proporcao - 50) / 5) * 10;
  return nota;
}

/** Grava a informação de formato nas duas cópias.
 *
 *  Atenção à orientação: os seis primeiros bits descem pela COLUNA 8, e os seis
 *  últimos correm pela LINHA 8 — não o contrário. Escrever transposto produz um
 *  código de aparência perfeita, com localizadores e dados corretos, que
 *  nenhum leitor abre: o formato é a primeira coisa que ele lê, e sem ele nem
 *  chega aos dados. Foi exatamente o defeito da primeira versão deste arquivo,
 *  e só apareceu na comparação contra o segno. */
function qrEscreverFormato(m, nivel, mascara) {
  const lado = m.length;
  const bits = qrFormato(nivel, mascara);
  for (let i = 0; i < 15; i += 1) {
    const v = (bits >> i) & 1;
    // Cópia junto ao localizador de cima à esquerda: sobe pela coluna e vira
    // para a direita na linha 8.
    if (i < 6) m[i][8] = v;
    else if (i === 6) m[7][8] = v;
    else if (i === 7) m[8][8] = v;
    else if (i === 8) m[8][7] = v;
    else m[8][14 - i] = v;
    // Cópia repartida entre os outros dois cantos, para o formato sobreviver
    // à perda de um canto inteiro.
    if (i < 8) m[8][lado - 1 - i] = v;
    else m[lado - 15 + i][8] = v;
  }
}

function qrEscreverVersao(m, versao) {
  if (versao < 7) return;
  const lado = m.length;
  const bits = qrInfoVersao(versao);
  for (let i = 0; i < 18; i += 1) {
    const v = (bits >> i) & 1;
    const y = Math.floor(i / 3);
    const x = lado - 11 + (i % 3);
    m[y][x] = v;
    m[x][y] = v;
  }
}

/* -------------------------------------------------------------- interface */

/** Gera a matriz do QR de `texto`.
 *
 *  Devolve { lado, modulos }, onde `modulos[y][x]` é 1 para escuro. Não desenha
 *  nada: quem desenha decide o tamanho do pixel e a margem. Deixar a margem por
 *  conta de quem desenha é de propósito — sobre fundo branco ela some no papel,
 *  mas o QR PRECISA dela (quatro módulos) para ser lido.
 *
 *  `nivel` é a correção de erro: L, M, Q ou H. O padrão é M. */
function gerarQR(texto, nivel = 'M') {
  if (!QR_BLOCOS[nivel]) throw new Error('Nível de correção desconhecido: ' + nivel);
  const bytes = Array.from(new TextEncoder().encode(String(texto)));
  const versao = qrEscolherVersao(bytes, nivel);
  if (!versao) {
    throw new Error(
      `Texto longo demais para este gerador: ${bytes.length} bytes no nível ${nivel}, `
      + `e o limite aqui é a versão 10 (${qrCapacidade(10, nivel)} codewords).`);
  }

  const lado = versao * 4 + 17;
  const dados = qrCodewordsDados(bytes, versao, nivel);
  const codewords = qrCodewordsFinais(dados, versao, nivel);

  const base = qrNovaMatriz(lado);
  qrPadroes(base, versao);
  // Os bits de sobra da versão (7 nas versões 2 a 6) não precisam de tratamento
  // próprio: `qrEscreverDados` escreve zero em tudo que passa do fim dos
  // codewords, que é exatamente o que a norma pede para eles.
  qrEscreverDados(base, codewords);

  let melhor = null;
  for (let n = 0; n < 8; n += 1) {
    const m = base.map((linha) => Int8Array.from(linha));
    // A máscara vale só para os dados: padrão e formato ficam como estão. A
    // matriz `base` já tem tudo preenchido, então o que distingue dado de
    // padrão é a matriz de reserva calculada em separado.
    const reserva = qrNovaMatriz(lado);
    qrPadroes(reserva, versao);
    for (let y = 0; y < lado; y += 1) {
      for (let x = 0; x < lado; x += 1) {
        if (reserva[y][x] === -1 && qrMascara(n, x, y)) m[y][x] ^= 1;
      }
    }
    qrEscreverFormato(m, nivel, n);
    qrEscreverVersao(m, versao);
    const nota = qrPenalidade(m);
    if (!melhor || nota < melhor.nota) melhor = { nota, m, n };
  }

  return {
    lado,
    versao,
    nivel,
    mascara: melhor.n,
    modulos: melhor.m.map((linha) => Array.from(linha))
  };
}

/** Desenha a matriz num contexto 2D já posicionado.
 *
 *  `lado` é o tamanho final em pixels, margem incluída. A margem de quatro
 *  módulos é obrigatória pela norma e é o erro mais comum de quem desenha QR à
 *  mão: sem ela, boa parte dos leitores simplesmente não enxerga o código. */
function desenharQR(ctx, qr, x, y, lado, cor = '#000000', fundo = '#FFFFFF') {
  const MARGEM = 4;
  const total = qr.lado + MARGEM * 2;
  // Arredondado para baixo: pixel fracionário faz o navegador interpolar e o
  // código sai com as bordas lavadas, que é justamente o que trava a leitura.
  const passo = Math.floor(lado / total);
  const desenhado = passo * total;
  const ox = x + Math.floor((lado - desenhado) / 2);
  const oy = y + Math.floor((lado - desenhado) / 2);

  if (fundo) {
    ctx.fillStyle = fundo;
    ctx.fillRect(ox, oy, desenhado, desenhado);
  }
  ctx.fillStyle = cor;
  for (let ly = 0; ly < qr.lado; ly += 1) {
    for (let lx = 0; lx < qr.lado; lx += 1) {
      if (!qr.modulos[ly][lx]) continue;
      ctx.fillRect(ox + (lx + MARGEM) * passo, oy + (ly + MARGEM) * passo, passo, passo);
    }
  }
  return { x: ox, y: oy, lado: desenhado, passo };
}
