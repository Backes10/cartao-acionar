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

const VERSAO = 'acionar-v25';

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
      .then((cache) => Promise.allSettled([...CASCA, ...DADOS].map((url) => cache.add(url))))
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
  evento.respondWith(
    caches.match(requisicao).then((emCache) => {
      const daRede = fetch(requisicao)
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
