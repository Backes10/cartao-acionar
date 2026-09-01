/* Página da indicação: onde cai quem aponta a câmera para o QR do cartão.
 *
 * Quem chega aqui NÃO é o cliente da Acionar — é um conhecido dele, a quem ele
 * mostrou o cartão. Ninguém escaneia a tela do próprio celular. Por isso a
 * página apresenta a corretora a quem nunca ouviu falar dela, e não repete o
 * que o cartão já diz.
 *
 * Não há servidor. O código da indicação viaja no fragmento do endereço (depois
 * do #), que o navegador nunca envia para lugar nenhum, e daqui ele entra na
 * mensagem pronta do WhatsApp. Assim quem escaneou não digita nada e não
 * precisa lembrar do código de outra pessoa — que é onde quase todo programa de
 * indicação se perde.
 *
 * O código é opaco de propósito: A7K2M9 não diz de quem é. A tradução para o
 * nome do cliente fica só no aparelho do vendedor e nunca sobe para a internet.
 *
 * A promoção, quando existir, vem de data/campanhas.json — página, não imagem.
 * O cartão impresso nunca promete número, porque fica anos no celular do
 * cliente e não há como corrigi-lo depois. */

const el = (id) => document.getElementById(id);

/** O código, limpo. Só letras e dígitos, curto.
 *
 *  Vem do endereço, que qualquer um pode digitar à mão, e vai para dentro de
 *  uma mensagem e de um `textContent`. Filtrar aqui é o que garante que nada
 *  além de código chegue nos dois lugares. */
function lerCodigo() {
  const bruto = decodeURIComponent((location.hash || '').replace(/^#/, '').trim());
  return bruto.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 12);
}

/** A campanha do momento, ou null.
 *
 *  Duas travas, e as duas importam: sem `ativa` não há promoção nenhuma, e
 *  passada a data em `ate` a campanha se desliga sozinha. A segunda existe
 *  porque esquecer de desligar é o modo normal de falhar — e uma promoção
 *  vencida ainda no ar é promessa que a corretora não pode honrar. */
function campanhaValida(arquivo) {
  if (!arquivo || !arquivo.ativa) return null;
  const c = (arquivo.campanhas || {})[arquivo.ativa];
  if (!c) return null;
  if (c.ate) {
    // Comparação de texto em ISO (AAAA-MM-DD) e não Date: `new Date('2026-12-31')`
    // é meia-noite UTC, e no fuso do Brasil a campanha morreria 21h antes.
    const hoje = new Date();
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    if (iso > String(c.ate)) return null;
  }
  return c;
}

function mostrarCampanha(c) {
  const alvo = el('campanha');
  if (!c) return;
  const linha = (texto, classe) => {
    if (!texto) return;
    const p = document.createElement('p');
    if (classe) p.className = classe;
    p.textContent = texto;
    alvo.appendChild(p);
  };
  const t = document.createElement('p');
  t.className = 'campanha__titulo';
  t.textContent = c.titulo || 'Indique e ganhe';
  alvo.appendChild(t);
  linha(c.indicado);
  linha(c.condicao);
  if (c.ate) linha('Válido até ' + c.ate.split('-').reverse().join('/'), 'campanha__prazo');
  alvo.classList.add('campanha--on');
}

/** A mensagem que já vai escrita na conversa.
 *
 *  O código entra aqui, e é isso que faz a indicação chegar sozinha: quem
 *  escaneou só toca no botão. Sem código a mensagem continua fazendo sentido —
 *  é o caso de quem digitou o endereço à mão ou de um QR lido pela metade. */
function mensagem(codigo) {
  return codigo
    ? `Olá! Vim por indicação. Código ${codigo}`
    : 'Olá! Vim pelo QR code do cartão de um cliente de vocês.';
}

function telefoneDaCorretora(corretora, rotulo, numero, movel) {
  const alvo = el('telefonesCorretora');
  const wa = movel ? telParaWaMe(numero) : '';
  const discar = telParaDiscagem(numero);
  const no = document.createElement(wa || discar ? 'a' : 'div');
  no.className = 'tel';
  if (wa) {
    no.href = 'https://wa.me/' + wa;
    no.rel = 'noopener';
  } else if (discar) {
    no.href = 'tel:' + discar;
  }
  const r = document.createElement('span');
  r.className = 'tel__rot';
  r.textContent = (corretora.nome || 'Acionar').split(' ')[0] + ' — ' + rotulo;
  const n = document.createElement('span');
  n.className = 'tel__num';
  n.textContent = numero;
  no.append(r, n);
  alvo.appendChild(no);
}

async function iniciar() {
  const codigo = lerCodigo();

  // Os dois arquivos em paralelo, e cada um com o próprio tratamento de falha.
  // Se a campanha não carregar, a página ainda apresenta a corretora e o botão
  // — que é o que ela precisa fazer. Foi a lição do Promise.all da página do
  // link, onde o corretora.json ia embora junto com o seguradoras.json.
  const buscar = (caminho) => fetch(caminho, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const [corretora, campanhas] = await Promise.all([
    buscar('../data/corretora.json'),
    buscar('../data/campanhas.json')
  ]);

  const dados = corretora || {};
  if (dados.nome) {
    el('titulo').textContent = dados.nome;
    document.title = dados.nome;
  }

  mostrarCampanha(campanhaValida(campanhas));

  const wa = telParaWaMe(dados.whatsapp || '');
  const botao = el('btnWhats');
  if (wa) {
    botao.href = `https://wa.me/${wa}?text=${encodeURIComponent(mensagem(codigo))}`;
  } else {
    // Sem WhatsApp cadastrado o botão viraria um link para lugar nenhum. Some,
    // e os telefones logo abaixo continuam sendo o caminho.
    botao.hidden = true;
  }

  /* Mesma regra da página do link: quando o WhatsApp e o telefone são o mesmo
   * número, os rótulos nomeiam a AÇÃO e não a linha. Aqui não há contato para
   * salvar, então bastam os dois toques. */
  if (mesmoTelefone(dados.whatsapp, dados.telefone)) {
    telefoneDaCorretora(dados, 'WhatsApp', dados.whatsapp, true);
    telefoneDaCorretora(dados, 'Ligar', dados.telefone, false);
  } else {
    if (dados.whatsapp) telefoneDaCorretora(dados, 'WhatsApp', dados.whatsapp, true);
    if (dados.telefone) telefoneDaCorretora(dados, 'Escritório', dados.telefone, false);
  }

  if (codigo) {
    const p = el('codigo');
    p.textContent = 'Código da indicação: ';
    const forte = document.createElement('strong');
    forte.textContent = codigo;
    p.appendChild(forte);
    p.hidden = false;
  }
}

// Mesmo tratamento da página do link: trocar só o fragmento não recarrega
// sozinho, e a página ficaria mostrando o código anterior.
window.addEventListener('hashchange', () => location.reload());
iniciar();
