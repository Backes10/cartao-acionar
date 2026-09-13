# Cartão Acionar

App para gerar o cartão do seguro e mandar pro cliente no WhatsApp.

Manda duas coisas juntas:

- **o contato** (`.vcf`) — o cliente salva na agenda com o nome `Seguro Auto - Honda Civic ABC1D23`.
  Em caso de sinistro ele digita "seguro" no telefone, acha e toca no número do reboque.
- **a imagem** (`.png`) — com a marca Acionar, os dados da apólice e os telefones.

Roda inteiro no aparelho. Nenhum dado de cliente sai do celular, não existe servidor nem banco.

---

## Antes de usar com cliente de verdade

**As 14 empresas do catálogo estão com os telefones conferidos.** Em 30/08/2026 a Acionar
ligou em cada número, corrigiu os rótulos para a finalidade real e devolveu o catálogo. A
marca **EXEMPLO** saiu do cartão.

> Sobram dois buracos de conteúdo, e nenhum se resolve sem a Acionar:
>
> - **SulAmérica** ficou com um telefone só, *"Atendimento Vida"*, e a entrada vale para auto,
>   moto, residencial, vida e empresarial. O cartão de auto imprime "EM CASO DE SINISTRO OU
>   REBOQUE" e embaixo o número de Vida. Falta o de assistência 24h.
> - **Bradesco Consórcio** ficou com um número só, `4004 4436`, marcado `semTel` — e o vCard
>   pula todo `semTel`, então o contato salvo pelo cliente sai sem número nenhum da
>   administradora. O número aparece na imagem, para digitar à mão. Falta um 0800.
>
> As duas estão marcadas como conferidas, então **não sai marca EXEMPLO avisando**.

Entrada nova entra com `"exemplo": true` e volta a valer o regime antigo, que continua no
código: imagem riscada com **EXEMPLO**, `EXEMPLO-` no nome do arquivo do contato, aviso amarelo
no passo 4, e a página do link avisando o cliente sem deixar nenhum número virar toque. É de
propósito — mandar um número de sinistro errado é o único jeito de esse app causar dano real.

### O manual do cadastro é um PDF, e ele não mora aqui

Cadastrar telefone de seguradora é o único cadastro deste app que pode causar dano real, e tem
regra que não se adivinha. O guia é um PDF de 6 páginas, com prints, feito para dar de ler a
quem vai fazer o cadastro:

```
fontes/Como-cadastrar-telefones-das-seguradoras.pdf
```

**Fora do repositório de propósito** — `fontes/` é ignorada pelo git. Quem regenera é
`fontes/tutorial.py` (o texto e o layout) com `fontes/figuras.py` (os três mockups). Mexeu na
tela do cadastro? Rode os dois de novo, senão o guia passa a ensinar uma tela que não existe:

```bash
cd fontes && python figuras.py figuras && python tutorial.py figuras Como-cadastrar-telefones-das-seguradoras.pdf ..
```

---

## No ar

**https://backes10.github.io/cartao-acionar/**

É a versão completa, servida pelo GitHub Pages a partir da pasta `docs/`. Funciona
offline, instala como app e é dela que sai o link que o cliente recebe
(`/t/#seguradora`).

`python build.py` também gera `dist/cartao-acionar.html`, o app inteiro num arquivo só,
para hospedagem que aceita um arquivo apenas. Essa versão **não** funciona offline nem
instala como app de verdade — serve para mandar por e-mail ou abrir de um pendrive.

## Como saber qual versão está no aparelho

No pé da tela tem **"Versão e diagnóstico"**. Abre e mostra:

| Linha | O que significa |
|---|---|
| Versão do app | a que está rodando agora |
| Versão guardada no aparelho | a do cache. **Verde = igual. Vermelho = você está preso numa antiga.** |
| Compartilha arquivos | `NÃO` significa que o botão de enviar não anexa nada e cai no plano B |
| Área de transferência | se dá para copiar a mensagem automaticamente |

O botão **Copiar diagnóstico** copia tudo isso em texto. É o jeito rápido de relatar
problema: copia, cola no WhatsApp e manda.

**Navegador importa, mas menos do que eu supunha.** Web Share com arquivos funciona no
**Chrome do Android**, no **Safari do iPhone** e — medido no aparelho, contra o que estava
escrito aqui antes — também no **Samsung Internet 30** (`sim`). Se algum dia o diagnóstico
disser `NÃO`, o rótulo do botão muda de *1. Enviar a imagem* para *Preparar para o
WhatsApp*, porque prometer envio que não acontece é pior que avisar, e o app baixa os dois
arquivos para você anexar à mão.

Esse `sim` vale para a **imagem**. O contato é outra história e não depende do navegador:
`.vcf` não está na lista de extensões que o Chromium aceita no Web Share, e todo navegador
de Android é Chromium. Por isso, no Android, o passo 3 diz **"Baixar o contato"** e não
"Enviar" — ver *No Android são dois passos*, abaixo.

## Publicando uma correção

O app fica guardado no aparelho para funcionar sem sinal — o que significa que ele
**não pega uma versão nova sozinha** se você não avisar.

Ao mexer em `index.html`, `styles.css`, `app.js` ou nos ícones, suba **dois** números
antes de publicar:

- `VERSAO` em `sw.js` (`acionar-v6` → `acionar-v7`)
- `VERSAO_APP` em `app.js` (`v6` → `v7`)

Precisam bater. O diagnóstico compara os dois e é assim que ele detecta aparelho preso
numa versão velha. Sem subir o do `sw.js`, o celular continua servindo o app antigo
indefinidamente.

Feito isso, na próxima vez que o vendedor abrir o app aparece uma faixa laranja
*"Tem versão nova do app — Recarregar"*. Ele toca e pronto. A troca só acontece no
toque dele, para não trocar a versão no meio de um cartão sendo preenchido.

Os dois JSON de `data/` são exceção: vão sempre pela rede, então telefone de seguradora
atualiza sem depender disso.

**Preso numa versão velha?** No diagnóstico, se o cache disser um número **maior** que a
versão do app, aparece o botão *Limpar e buscar de novo* — use ele. No Android também dá
pela mão: menu do navegador → Configurações do site → o endereço → Excluir dados.

## Como publicar

O site no ar é o **GitHub Pages servindo a pasta `docs/`** do `main`. Editar o código não
publica nada: `docs/` é gerado pelo `build.py` e precisa ir junto no commit.

```bash
python build.py
```

```bash
git add -A && git commit -m "o que mudou" && git push
```

O `build.py` faz mais do que copiar — ele recusa o build quando algo está errado:

| Trava | Por que existe |
|---|---|
| `sw.js` e `app.js` com versões diferentes | o diagnóstico acusaria aparelho desatualizado num aparelho recém-atualizado |
| arquivo em `docs/` sem estar previsto | sobra de build anterior indo para o ar sem ninguém ver |
| extensão fora da lista (PDF, zip…) | já foram para o ar 4,3 MB de PDFs de origem, provável causa do estouro de crédito da hospedagem |
| `docs/` acima de 2 MB | algo grande entrou sem ninguém perceber |
| `index.html` sem o carimbo `?v=` | HTML e JavaScript poderiam vir de versões diferentes |

O Pages leva de 30 s a 2 min para publicar. Para confirmar que subiu:

```bash
curl -s https://backes10.github.io/cartao-acionar/app.js | grep VERSAO_APP
```

No celular: **iPhone** Safari → Compartilhar → *Adicionar à Tela de Início*;
**Android** Chrome → menu → *Instalar app*. Precisa de HTTPS (o Pages já dá) para
funcionar offline e para o botão de enviar anexar os arquivos.

### Rodar no computador para testar

Não abra o `index.html` clicando duas vezes — o navegador bloqueia a leitura dos arquivos
de dados em `file://`. Na pasta do projeto, rode um destes e abra o endereço que aparecer:

```bash
python -m http.server 8123
```

```bash
npx serve .
```

---

## Primeira configuração

**Já vem preenchida** com os dados do cartão que a Acionar envia hoje: logo, laranja
`#EB6522`, grafite `#3A3737`, WhatsApp e telefone `(51) 3566-0010` e o e-mail. O celular
saiu a pedido da Acionar em 01/09/2026: o fixo do escritório atende nos dois canais, e o app
junta os dois num item só onde repetir faria mal (rodapé do cartão, contato do cliente). Não precisa configurar nada para começar.

Confira dois pontos no ⚙ do topo:

- **Nome do corretor** — está vazio. Sem ele o cartão assina "Acionar Corretora de
  Seguros"; com ele, o bloco fica pessoal ("WhatsApp Sérgio", por exemplo).
- **WhatsApp** — está o do escritório, `(51) 3566-0010`. Se o cliente deve falar com uma
  pessoa e não com o número geral, troque aqui.
- **Site** — está vazio de propósito. Veja *Dois problemas no cartão antigo*, abaixo.

Também dá para mudar o **padrão do nome do contato** por produto, se `Seguro Auto -
{marca} {modelo} {placa}` não for o que você quer.

Fica salvo no navegador do aparelho. Trocou de celular, configura de novo.

Para trocar o logo, é só subir outro no ⚙ — o do projeto está em
`assets/logo-acionar.png`, recortado da arte atual. Logo de traço fica melhor; com
degradê ou foto o app comprime sozinho para caber como foto de contato.

---

## O dia a dia

Os botões de enviar e baixar ficam **travados** até o cartão estar completo: campos
obrigatórios preenchidos e seguradora escolhida. A caixa vermelha acima deles diz o que
falta. Cartão sem seguradora sai sem telefone de sinistro — pior que cartão nenhum, porque
o cliente acha que está protegido.

1. Escolhe o produto (Auto, Moto, Residencial, Vida, Empresarial).
2. Escolhe a seguradora — os telefones entram preenchidos.
3. Digita só o que muda: segurado, veículo, placa, apólice, vigência, franquia.
4. Confere a prévia.
5. **Enviar no WhatsApp** → escolhe o cliente.

O **Histórico** guarda os cartões dos últimos **18 meses**, até 500: *Usar* recarrega tudo,
você só troca a vigência e reenvia. Renovação anual em 10 segundos.

A janela é de tempo, e não de contagem, porque o que se procura ali é o cartão do ano passado —
e isso é um prazo. Também é o que torna aquilo retenção de verdade: o dado do cliente sai do
aparelho sozinho, sem depender de alguém lembrar de limpar.

Com a lista grande, o campo de busca no topo dela procura por **cliente, placa ou veículo** —
cada palavra digitada conta, em qualquer ordem. O nome do segurado entra na busca mesmo sem ser
o título da linha: um ano depois ninguém procura "Civic", procura "Maria". O **✕** de cada linha
apaga só aquele cartão; *Limpar histórico* leva todos, e os dois perguntam antes.

### No Android são dois passos, e não tem como ser um

**O `.vcf` não pode ser compartilhado no Android.** O Chromium mantém uma lista fechada de
extensões que a Web Share aceita (`.png`, `.jpg`, `.pdf`, `.txt`… 47 delas) e `.vcf` não
está nela. Vale para Chrome, Samsung Internet, Edge — todos são Chromium. No iPhone o
Safari não usa essa lista, então lá o contato vai junto com a imagem num toque só.

Detalhe traiçoeiro: `navigator.canShare()` responde **sim** para o `.vcf`. A lista só é
aplicada dentro do `share()`, que rejeita com `NotAllowedError`. Sondar antes não serve.

Então no Android:

1. **Enviar no WhatsApp** → a imagem vai. Um toque.
2. **Baixar o contato para anexar** → depois, no WhatsApp: **clipe 📎 → Documento →** o `.vcf`.

> **Não abra o `.vcf` no seu celular.** Abrir salva o contato na *sua* agenda e não manda
> nada para o cliente. Ele tem de ser **anexado** na conversa.

**Cole a legenda.** A mensagem vai para a área de transferência, não dentro do
compartilhamento — mandar arquivo e texto na mesma chamada faz o Android tratar tudo como
texto puro e o WhatsApp descarta os anexos.

---

## Dois problemas no cartão antigo (o PDF de 2024)

Encontrados ao abrir os links embutidos no `Acionar_cartao2024.pdf`. Não afetam o app
novo, mas o PDF continua circulando:

1. **O ícone do globo (site) aponta para `https://gohotel.com.br/`** — um site de hotel.
   Quem toca em "site" no cartão da Acionar vai para outra empresa. Por isso o campo Site
   ficou vazio na configuração: não vou adivinhar o endereço certo. Me diga qual é e eu
   coloco.
2. **O botão "Ligue Agora" não é um `tel:` direto** — ele passa por
   `https://www.sejda.com/call/+555135660010`. O Sejda é o editor de PDF usado para montar
   a arte, e ele embrulhou o link no próprio domínio. Funciona, mas a ligação do cliente
   depende de um site de terceiro continuar no ar, e cada toque vaza para eles.

Instagram, Facebook e o endereço no Maps estão certos.

## O QR de indicação

O cartão traz um QR no espaço vazio à direita dos telefones, com a frase *"Conhece quem precisa
de seguro?"*. Ele **não é para o cliente que recebeu** — ninguém escaneia a tela do próprio
celular. É para a segunda pessoa, o conhecido a quem ele mostra o cartão.

Quem aponta a câmera cai em `a/`, que apresenta a corretora e abre o WhatsApp com a mensagem já
escrita: *"Olá! Vim por indicação. Código A7K2M9"*. O conhecido não digita nada e não precisa
lembrar do código de outra pessoa — ele viaja sozinho dentro do endereço.

O código identifica **quem indicou**. É sorteado na primeira vez que a cliente recebe um cartão
e reaproveitado depois, então dois cartões para a mesma pessoa saem com o mesmo código. Para
saber de quem é um código que chegou no WhatsApp: ⚙ → *Quem indicou? Busque o código*.

### Três regras que não se quebram

1. **O cartão nunca promete número.** A imagem é congelada: fica anos no celular de quem
   recebeu e não há como corrigi-la. Ao lado do QR só entra frase permanentemente verdadeira,
   nunca "ganhe 10%" — uma promoção impressa continua circulando depois de acabar.
2. **A promoção mora na página, que se atualiza.** Está em `data/campanhas.json`, hoje com
   `"ativa": null`. Ligar a campanha é trocar uma linha, e vale na hora para **todos os cartões
   já enviados**, sem reimprimir nada. É por isso que o código entra no QR desde já, mesmo sem
   promoção: sem ele, cartão enviado hoje ficaria sem atribuição amanhã.
3. **Nome de cliente não viaja.** O código é opaco e a tradução código → nome fica só no
   aparelho do vendedor. Por isso ela **não** entra no `exportarCatalogo`, que existe para ser
   mandado para publicação.

Falta a Acionar decidir o que quem indica ganha (seção 6 de `fontes/Indicacao-por-QR-code.pdf`).
Enquanto não decide, o QR funciona como cartão de visita digital da corretora.

## O que não vai no cartão

Nome, veículo, placa, apólice, vigência e franquia — sim.
CPF, endereço completo e dados de pagamento — **não**. O cartão pode ser reencaminhado
por engano; só entra o que é inofensivo fora de contexto.

No seguro residencial e empresarial, use o campo de endereço só com bairro e cidade.

---

## Estrutura

| Arquivo | O que é |
|---|---|
| `index.html` `styles.css` `app.js` | o app |
| `comum.js` | regras de telefone e de vCard compartilhadas entre o app e a página do link. Já estiveram duplicadas e sete de oito cópias divergiram. |
| `t/` | a página que o cliente abre pelo link da mensagem |
| `qr.js` | gerador de QR code próprio, sem dependência externa. Conferido por `fontes/conferir-qr.py` |
| `a/` | a página onde cai quem escaneia o QR de indicação do cartão |
| `c/` `telefones/` | endereços antigos da mesma página, redirecionando. Existem por precaução: **nenhum cliente recebeu link ainda**, então hoje não há nada apontando para eles. |
| `data/seguradoras.json` | **catálogo de telefones — é o que você mantém** |
| `data/produtos.json` | campos e padrão de nome de cada produto |
| `data/campanhas.json` | liga e desliga a promoção da indicação. Com `"ativa": null` o QR não promete nada |
| `data/corretora.json` | os dados da Acionar que a **página do link** usa. O app usa os de Configurações e compara os dois. |
| `assets/` | logo, ícones e os logos das seguradoras |
| `sw.js` `manifest.webmanifest` | fazem funcionar offline e instalar como app |
| `build.py` | gera `docs/` (o site) e `dist/` (o arquivo único) |
| `docs/` | **o que está no ar.** Gerado, mas vai no commit — é de lá que o Pages serve. |
| `fontes/` | material de origem e o **PDF do manual do cadastro**. Ignorada pelo git. |
| `PLANO.md` | o plano completo, com as decisões e o que vem nas próximas fases |

Para adicionar um produto novo (consórcio, por exemplo), o lugar é `data/produtos.json` —
copie um bloco existente e ajuste os campos. Não precisa mexer em código.

---

## Detalhes que parecem bobos mas não são

Se algum dia alguém for mexer no gerador do contato, cuidado com estes — cada um é um
problema que já aconteceu e está resolvido:

- **`0800` não pode levar `+55`.** `+55 0800 727 2754` não completa a chamada. Números
  0800/0300/4003/4004 vão em formato nacional; celular e fixo vão em `+55`.
- **vCard 3.0, não 4.0.** É o que iPhone e Google Contatos importam de verdade.
- **Etiqueta de telefone ("Reboque", "Sinistro")** precisa sair em dois formatos ao mesmo
  tempo: o proprietário da Apple (`X-ABLabel`) e o `TYPE` padrão. Alguns Android ignoram o
  primeiro. Por isso a lista etiquetada também vai nas Observações, que aparece em
  qualquer aparelho.
- **Quebra de linha `CRLF` e dobra a 75 octetos** são exigência da especificação. Sem
  isso a importação falha *em silêncio* em parte dos aparelhos.
- **Foto do contato acima de ~60 KB** faz importador desistir da foto, às vezes do arquivo
  inteiro. O app tenta PNG e cai pro JPEG quando não cabe.
- **Nome de arquivo com acento** quebra no iOS.

---

## Ainda falta

Estas coisas o app **não** faz e estão planejadas (ver `PLANO.md`):

- Gerar cartões em lote a partir de uma planilha de apólices.
- Aviso de renovação.
- Publicar pela tela o catálogo que o vendedor cadastrou. Hoje o que ele edita
  vale no aparelho dele, e o link do cliente só vê o que está no projeto — o app
  detecta a diferença e deixa o link fora da mensagem, mas quem publica sou eu,
  a partir do JSON exportado.

E os testes que só dão para fazer com aparelho na mão:

- **importar o contato num iPhone, num Android com Google Contatos e num Samsung**, conferindo
  etiqueta, discagem e foto;
- **ler o QR do cartão com iPhone e com Android**, da tela de um aparelho pela câmera de outro.
  O gerador foi conferido contra duas bibliotecas independentes, mas câmera de celular tem
  tolerância própria.
