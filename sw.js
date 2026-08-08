/* Service worker do Cartão Acionar.
 *
 * Duas exigências que brigam entre si:
 *   - abrir na hora e funcionar sem sinal (o sinistro não espera 4G);
 *   - receber correção publicada, senão o aparelho fica preso numa versão velha.
 *
 * A primeira versão só resolvia a primeira: cache-first com versão fixa. Deploy
 * novo no ar e o celular continuava servindo o app antigo, para sempre.
 *
 * Agora:
 *   - casca (html/css/js/ícones): responde do cache na hora E busca por trás
 *     (stale-while-revalidate). Abre rápido, funciona offline, e a correção
 *     entra no cache para a próxima abertura.
 *   - dados (os JSON): rede primeiro. Telefone de seguradora não pode atrasar.
 *   - a troca só acontece quando o vendedor toca em "Recarregar" no aviso. Sem
 *     isso o app trocaria de versão no meio de um cartão sendo preenchido.
 *
 * MEXEU EM QUALQUER ARQUIVO DA CASCA? Suba o número do VERSAO abaixo.
 */

const VERSAO = 'acionar-v40';

const CASCA = [
  '.',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'assets/logo-acionar.png',
  'assets/icone-192.png',
  'assets/icone-512.png'
];

const DADOS = ['data/produtos.json', 'data/seguradoras.json'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      // addAll falha inteiro se um item falhar; ícone faltando não pode derrubar o app.
      //
      // `cache: 'reload'` é o detalhe que faltava e que fez o cache v39 nascer
      // com os arquivos da v38: sem ele, o cache.add busca pelo cache HTTP do
      // navegador, e o GitHub Pages manda max-age=600. Por dez minutos depois
      // de publicar, o navegador entrega o app.js antigo sem perguntar ao
      // servidor — e o service worker guarda esse arquivo velho sob o nome
      // novo. O aparelho ficava dizendo "cache guardado é v39" enquanto rodava
      // a v38, e recarregar não adiantava porque o cache novo já estava
      // envenenado. Com 'reload' a busca ignora o cache HTTP e vai na rede.
      .then((cache) => Promise.allSettled(
        [...CASCA, ...DADOS].map((url) => cache.add(new Request(url, { cache: 'reload' })))
      ))
  );
  // Sem skipWaiting aqui de propósito: quem decide a troca é a página, no
  // aviso de atualização. Trocar sozinho deixaria HTML novo rodando JS velho.
});

self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'ASSUMIR_AGORA') self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

function guardar(requisicao, resposta) {
  if (!resposta || !resposta.ok || resposta.type !== 'basic') return;
  const copia = resposta.clone();
  caches.open(VERSAO).then((cache) => cache.put(requisicao, copia));
}

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;

  // Dados: rede primeiro, cache como rede de segurança.
  if (url.pathname.includes('/data/')) {
    evento.respondWith(
      fetch(requisicao)
        .then((resposta) => {
          guardar(requisicao, resposta);
          return resposta;
        })
        .catch(() => caches.match(requisicao).then((c) => c || Promise.reject(new Error('sem cache'))))
    );
    return;
  }

  // Casca: cache na hora, rede por trás para a próxima abertura.
  //
  // ignoreSearch porque o build carimba a versão no endereço ("app.js?v=v38")
  // para o HTML nunca puxar um JavaScript de outra versão. Sem ignorar a
  // query, o endereço carimbado não casaria com o "app.js" guardado e o app
  // não abriria sem sinal na primeira vez. Não há risco de servir versão
  // errada: cada VERSAO tem seu próprio cache, e o anterior é apagado no
  // activate — dentro de uma versão o carimbo é sempre o mesmo.
  evento.respondWith(
    caches.match(requisicao, { ignoreSearch: true }).then((emCache) => {
      // 'reload' aqui pela mesma razão do install: sem ele a busca de fundo
      // pode ser respondida pelo cache HTTP com o arquivo antigo, e a correção
      // publicada nunca entra — o app se atualizaria para ele mesmo.
      const daRede = fetch(new Request(requisicao.url, { cache: 'reload' }))
        .then((resposta) => {
          guardar(requisicao, resposta);
          return resposta;
        })
        .catch(() => null);

      // waitUntil segura a atualização mesmo quando o cache respondeu primeiro.
      evento.waitUntil(daRede);

      if (emCache) return emCache;
      return daRede.then((r) => r || caches.match('index.html'));
    })
  );
});
