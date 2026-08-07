# Cartão Acionar

App para gerar o cartão do seguro e mandar pro cliente no WhatsApp.

Manda duas coisas juntas:

- **o contato** (`.vcf`) — o cliente salva na agenda com o nome `Seguro Auto - Honda Civic ABC1D23`.
  Em caso de sinistro ele digita "seguro" no telefone, acha e toca no número do reboque.
- **a imagem** (`.png`) — com a marca Acionar, os dados da apólice e os telefones.

Roda inteiro no aparelho. Nenhum dado de cliente sai do celular, não existe servidor nem banco.

---

## Antes de usar com cliente de verdade

**A Yelum já está com os números reais**, tirados da imagem oficial que a Acionar envia hoje.
Cartão de Yelum sai limpo, pronto para mandar.

> **As outras 12 seguradoras estão com telefones FICTÍCIOS** (`0800 000 0001` e parecidos).
> Enquanto estiverem assim, a imagem sai com a marca **EXEMPLO** atravessada e o
> arquivo do contato vem com `EXEMPLO-` no nome. É de propósito: mandar um número
> de sinistro errado é o único jeito de esse app causar um problema real.

### Cadastrando pela tela (jeito fácil)

No passo 2, toque em **Cadastrar / editar seguradoras**. Dá para:

- editar telefones, rótulos e tipo de qualquer seguradora
- subir o **logo** dela (use a versão escura da marca — o cartão é branco)
- criar seguradora nova e excluir as que ele não vende
- marcar **"Já liguei em todos estes números"** — é isso que tira o EXEMPLO do cartão

Cada telefone tem três campos que valem entender:

| Campo | Onde aparece |
|---|---|
| **Número** | escreva como escreveria para um cliente: `0800 701 4120` |
| **Rótulo na imagem** | as palavras da própria seguradora, na imagem do cartão |
| **Rótulo curto na agenda** | curto, prefixado com o nome dela: `Yelum Capital e RM` |

E a caixa **"Não virar telefone clicável"**: marque em números **4004** e **3003**. Eles não têm
formato internacional válido e o Android reescreve — num teste real `4004 5423` virou um
celular de DDD 47 que **pertence a uma pessoa de verdade**, e apareceu no contato com nome
e foto dela. Marcado, o número fica visível na imagem para digitar à mão, sem risco de
mandar o cliente ligar para uma estranha.

> **O que ele cadastra fica só no aparelho dele.** Em *Backup do catálogo* → **Exportar**
> sai um `seguradoras.json`. Mande esse arquivo para embutir no projeto — aí passa a valer
> em qualquer celular, e sobrevive a trocar de aparelho.
>
> Os ajustes locais **sobrepõem** o catálogo do projeto, não substituem: dá para publicar
> uma seguradora nova na base sem apagar o que ele já cadastrou.

### Editando o arquivo direto (jeito manual)

Para liberar as demais:

1. Abra `data/seguradoras.json`.
2. Para cada seguradora, troque os números pelos reais — use a imagem de contatos que
   a Acionar já manda hoje como fonte.
3. Troque `"exemplo": true` por `"exemplo": false` **só** na seguradora que você já conferiu.
4. **Ligue em cada número antes de liberar.** Sério.

Seguradora que sobrar com `"exemplo": true` continua marcada, uma por uma. Você pode
liberar Porto hoje e Azul na semana que vem.

### Formato de um telefone

```json
{
  "rotulo": "Capital e Região Metropolitana",
  "rotuloCurto": "Capital e RM",
  "numero": "4004 5423",
  "tipo": "assistencia",
  "semTel": true
}
```

| Campo | Para que serve |
|---|---|
| `rotulo` | vai na **imagem** do cartão, que tem espaço e cabeçalho explicando |
| `rotuloCurto` | vai no **contato da agenda**, prefixado com o nome da seguradora: `Yelum Capital e RM`. Opcional — sem ele usa o `rotulo` |
| `semTel` | o número aparece na imagem e nas observações, mas **não** vira telefone clicável |

**Por que `rotuloCurto` existe:** na agenda o rótulo longo aparece cortado no meio
("Capital e Região Metro…"), e o cliente não sabe de quem é o número. Com a marca na
frente e curto, ele lê `Yelum Capital e RM` inteiro.

**Quando usar `semTel`:** números **4004** não têm formato internacional válido. Num teste
real o Android reescreveu `4004 5423` como um celular de outro DDD que **pertence a uma
pessoa de verdade** — ela apareceu no contato com nome e foto. Um cliente em pânico ligaria
para uma estranha achando que era a seguradora. Número errado na agenda é pior que número
ausente: marque `semTel` e ele fica visível na imagem, para digitar à mão.

Números `0800` sobrevivem intactos e podem ser telefone normal.

`tipo` pode ser `assistencia`, `sinistro`, `sac`, `whatsapp`, `ouvidoria` ou `outro` —
ele só define a ordem no cartão. Escreva o número como você escreveria pra um cliente
(`0800 727 2754`, `(11) 3003-9393`); o app converte pro formato que o telefone disca.

**O `rotulo` tem de ser o mesmo que a seguradora publica.** A Yelum, por exemplo, separa
os telefones por região (*Capital e Região Metropolitana*, *Demais Regiões*), não por
finalidade. Não troque isso por "Sinistro" ou "Assistência 24h" para ficar mais bonito:
se o cliente ligar no número errado achando que é outra coisa, o cartão piorou a situação
em vez de ajudar.

---

## Link de teste (já no ar)

https://claude.ai/code/artifact/8f02b211-e012-456c-94cc-6a2cd881b519

É a versão de **arquivo único**, gerada por `python build.py`. Serve para testar de ponta
a ponta hoje: abre no celular, monta um cartão, manda pra si mesmo no WhatsApp e vê o
contato entrando na agenda.

O que essa versão **não** tem, por ser um arquivo só: não funciona offline e não instala
como app de verdade (dá para adicionar à tela de início, mas abre no navegador). Para
produção, publique a pasta completa — instruções abaixo.

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

**Navegador importa.** Web Share com arquivos funciona bem no **Chrome do Android** e no
**Safari do iPhone**. No Samsung Internet costuma vir `NÃO` — e aí o app baixa os dois
arquivos e você anexa à mão. Se o diagnóstico disser `NÃO`, o rótulo do botão muda de
*Enviar no WhatsApp* para *Preparar para o WhatsApp*, porque prometer envio que não
acontece é pior que avisar.

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

**Preso numa versão velha?** No Android: menu do navegador → Configurações do site →
o endereço → Excluir dados. Depois abra de novo.

## Como colocar no ar

O app é um site estático — qualquer hospedagem grátis serve.

1. Suba a pasta inteira no [Netlify Drop](https://app.netlify.com/drop) (arrasta e solta),
   na Vercel ou no GitHub Pages.
2. Abra o endereço no celular.
3. **iPhone:** Safari → Compartilhar → *Adicionar à Tela de Início*.
   **Android:** Chrome → menu → *Instalar app* / *Adicionar à tela inicial*.

Precisa de HTTPS (que essas hospedagens já dão) para o app funcionar offline e para o
botão *Enviar no WhatsApp* anexar os arquivos.

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
`#EB6522`, grafite `#3A3737`, WhatsApp `(51) 99741-4049`, escritório `(51) 3566-0010`
e o e-mail. Não precisa configurar nada para começar.

Confira dois pontos no ⚙ do topo:

- **Nome do corretor** — está vazio. Sem ele o cartão assina "Acionar Corretora de
  Seguros"; com ele, o bloco fica pessoal ("WhatsApp Sérgio", por exemplo).
- **WhatsApp** — está o geral, `(51) 99741-4049`. O cartão antigo tem também um
  *WhatsApp Sérgio* `(51) 99988-8643`. Se o cliente deve falar com uma pessoa e não com
  o número geral, troque aqui.
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

O **Histórico** guarda os últimos 20 cartões: *Usar* recarrega tudo, você só troca a
vigência e reenvia. Renovação anual em 10 segundos.

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
| `data/seguradoras.json` | **catálogo de telefones — é o que você mantém** |
| `data/produtos.json` | campos e padrão de nome de cada produto |
| `assets/` | logo e ícones |
| `sw.js` `manifest.webmanifest` | fazem funcionar offline e instalar como app |
| `build.py` | junta tudo num arquivo só, em `dist/` |
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

- Consórcio (a estrutura já suporta, falta cadastrar o produto e as administradoras).
- Editar o catálogo de seguradoras pela tela, sem abrir o JSON.
- Gerar cartões em lote a partir de uma planilha de apólices.
- Aviso de renovação.

E o teste que só dá para fazer com aparelho na mão: **importar o contato num iPhone, num
Android com Google Contatos e num Samsung**, conferindo etiqueta, discagem e foto.
