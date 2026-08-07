# Cartão Acionar — Plano

Gerador de "cartão do seguro" para envio por WhatsApp: contatos da seguradora + dados da
apólice, salvável na agenda do celular (iOS e Android).

> **Decisões travadas** — PWA instalável no celular; Fase 1 cobre todos os *seguros*
> (auto, moto, residencial, vida, empresarial), consórcio fica para a Fase 2.
> Fase 1 está implementada — instruções de uso no [README](README.md).
>
> **Marca e primeiros dados reais já entraram:** logo recortado da arte de 2024, laranja
> `#EB6522` e grafite `#3A3737` amostrados do próprio PDF, contatos da corretora, e a
> **Yelum** (ex-Liberty) com telefones conferidos. As outras 12 seguradoras seguem
> fictícias e marcadas.

---

## 1. A ideia central

Hoje o cliente recebe **uma imagem**. Imagem tem 3 problemas:

- número não é clicável — no momento do sinistro o cliente digita errado;
- some no meio de 4.000 fotos da galeria;
- não diz **de qual** seguro é (o cliente tem carro, moto e casa segurados).

A solução não é uma imagem melhor. É um **contato de agenda (vCard / `.vcf`)** chamado
`Seguro Auto - Honda Civic ABC1D23`. O cliente salva uma vez e:

- digita "Seguro" na agenda → acha na hora, mesmo 8 meses depois;
- toca no número **Reboque** → liga direto;
- os dados da apólice ficam no campo Observações do contato.

**Entrega = 3 peças enviadas juntas no WhatsApp:**

| Peça | Formato | Papel |
|---|---|---|
| Cartão de contato | `.vcf` | O que resolve. Salva na agenda, números clicáveis. |
| Cartão visual | `.png` | Aparece na conversa, tem a marca Acionar, é o que ele "vê". |
| Mensagem | texto | Explica em 2 linhas o que fazer com o `.vcf`. |

O `.png` é o marketing. O `.vcf` é a utilidade. Um sem o outro entrega metade.

---

## 2. Como o vendedor usa (meta: 40 segundos)

1. Abre o app no celular (ícone na tela inicial, funciona offline).
2. Escolhe **produto**: Auto / Moto / Residencial / Vida / Empresarial / Consórcio.
3. Escolhe **seguradora** numa lista → os telefones entram preenchidos (catálogo salvo).
4. Digita só o que muda: segurado, veículo, placa, apólice, vigência, franquia.
5. Vê o preview do cartão na tela.
6. Toca **Enviar no WhatsApp** → abre a folha de compartilhamento já com `.vcf` + `.png`.
7. Escolhe o cliente. Pronto.

Extras que economizam tempo no dia a dia:
- **Histórico local** dos últimos cartões → reenviar em 2 toques.
- **Duplicar** um cartão → renovação anual vira 10 segundos.
- **Rascunho automático** → se fechar o app sem terminar, não perde.

---

## 3. O nome do contato (o pedido central)

Padrão: começa com a palavra do produto, então tudo agrupa junto na agenda do cliente
e a busca "seguro" acha todos.

| Produto | Nome gerado |
|---|---|
| Auto | `Seguro Auto - Honda Civic ABC1D23` |
| Moto | `Seguro Moto - Honda CG 160 XYZ4E56` |
| Residencial | `Seguro Residencial - Apto Rua das Flores 320` |
| Vida | `Seguro de Vida - João da Silva` |
| Empresarial | `Seguro Empresarial - Padaria Pão Quente` |
| Consórcio | `Consórcio Imóvel - Grupo 1234 Cota 567` |

Detalhes:
- Os templates ficam **editáveis** — se ele preferir `Seguro Porto - Civic ABC1D23`, muda numa tela.
- Empresa do contato (`ORG`) = `Porto Seguro • Corretora Acionar`. Assim buscar "Acionar" na
  agenda também acha — a marca dele fica no celular do cliente para sempre.
- Emoji no nome (`🚗 Seguro Auto…`) fica disponível como opção, desligada por padrão:
  emoji joga o contato para o topo da lista e atrapalha a ordenação alfabética.

---

## 4. O que vai dentro do cartão

**Telefones** (cada um com etiqueta própria, clicável):
- Assistência 24h / Reboque
- Aviso de Sinistro
- SAC da seguradora
- WhatsApp da seguradora (se tiver)
- **Corretor Acionar — WhatsApp** ← esse é o que traz o cliente de volta

**Dados da apólice** (no visual e nas Observações do contato):
- Segurado
- Bem segurado (veículo + placa / endereço / bem do consórcio)
- Seguradora, nº da apólice, vigência
- Franquia — a pergunta nº 1 na hora do sinistro
- Opcional: carro reserva (X dias), guincho até Y km, cobertura de vidros

**Não vai no cartão:** CPF, endereço completo, dados de pagamento. O cartão pode ser
reencaminhado por engano — só entra o que é inofensivo fora do contexto.

---

## 5. Os detalhes técnicos que fazem isso funcionar nos dois sistemas

Esta é a parte que quebra se for feita no automático. Cada item abaixo é um problema real:

1. **vCard 3.0, não 4.0.** É o formato que iPhone e Google Contacts realmente importam bem.
2. **Etiquetas personalizadas ("Reboque", "Sinistro").** iOS só entende via propriedade
   agrupada da Apple (`item1.TEL` + `item1.X-ABLabel`). Alguns importadores Android ignoram
   isso e mostram "Outro". Solução: emitir a etiqueta Apple **e** um tipo padrão na mesma
   linha, **e** repetir a lista etiquetada nas Observações — que aparece em 100% dos
   aparelhos. Nenhuma informação se perde em nenhum cenário.
3. **0800 não pode levar `+55`.** `+55 0800 727 2754` não completa a chamada. Números 0800 e
   4004 vão em formato nacional; celular e fixo vão em `+55`. Errar isso deixa o número
   principal do cartão inutilizável.
4. **Quebra de linha CRLF e "folding" a 75 caracteres.** Exigência da especificação. Sem isso
   a importação falha silenciosamente em alguns aparelhos — o pior tipo de bug aqui.
5. **Escape de `,` `;` e quebra de linha** nos textos. Nome de segurado com vírgula corrompe
   o arquivo.
6. **Logo da Acionar como foto do contato** (`PHOTO` em base64, comprimida). Vira o avatar na
   agenda do cliente. Precisa ficar pequena — foto grande faz importador travar.
7. **Envio pelo WhatsApp**: `navigator.share` com arquivos, suportado em Android Chrome e
   iOS Safari 15+. Em Android o cliente toca no `.vcf` e o Android já oferece "Adicionar
   contato". Em iOS são 2 toques (abrir → adicionar aos contatos) — por isso a mensagem de
   texto acompanha uma instrução curta.
8. **Nome do arquivo** sanitizado (`Seguro-Auto-Honda-Civic-ABC1D23.vcf`) — acento e barra em
   nome de arquivo quebram no iOS.
9. **PNG desenhado em canvas nativo**, sem biblioteca externa. Renderizar HTML para imagem
   tem bugs de fonte no Safari; canvas é previsível e a imagem sai nítida.

---

## 6. Arquitetura

**Site estático + PWA. Zero servidor, zero banco.** Todo o processamento acontece no
aparelho — nenhum dado de cliente sai do celular. Isso resolve LGPD por construção, não
por política.

```
Cartao_Acionar/
  index.html              app (formulário + preview + enviar)
  app.js                  estado, templates, geração de vCard e PNG, share
  styles.css              visual, tema Acionar
  sw.js                   service worker → funciona sem internet
  manifest.webmanifest    instalável como app na tela inicial
  data/
    seguradoras.json      catálogo: seguradora → telefones (o ativo reutilizável)
    produtos.json         campos e template de nome por produto
  assets/
    logo-acionar.png
```

Publicação: Netlify / Vercel / GitHub Pages (grátis). Ele abre a URL uma vez no celular,
"Adicionar à tela de início", e daí em diante é um app.

**Por que PWA e não app de loja:** um app nativo custa conta de desenvolvedor Apple
(USD 99/ano), revisão da App Store e republicação a cada mudança de telefone de seguradora.
O PWA cobre iOS e Android com uma base de código e atualiza sozinho. Se um dia precisar de
loja, o código do cartão se aproveita inteiro.

---

## 7. Fases

**Fase 1 — pronta**
Os cinco seguros (auto, moto, residencial, vida, empresarial), gerador de vCard, PNG com a
marca, envio pelo WhatsApp com queda para download quando o aparelho não anexa, catálogo de
12 seguradoras, histórico com reuso para renovação, configuração de corretor/logo/cores,
templates de nome editáveis, PWA offline. Falta só trocar os telefones fictícios pelos reais.

**Fase 2 — o que ficou de fora**
Consórcio (a estrutura de produtos já suporta; falta cadastrar o produto e as
administradoras — Porto, Rodobens, Embracon, Ademicon). Editor do catálogo de seguradoras
pela tela, sem abrir o JSON.

**Fase 3 — escala (só se fizer sentido depois)**
Importar planilha de apólices e gerar cartões em lote; página web por cartão com link curto;
aviso de renovação.

---

## 8. Como saber que está pronto

**Já verificado no navegador** (automatizado, sobre o app rodando):

- vCard: `CRLF` em todas as linhas, dobra exata em 75 octetos sem cortar acento no meio de
  um caractere, texto volta idêntico ao desdobrar, base64 da foto decodifica intacto
- 0800 gravado como `08000000001` (sem `+55`) e celular como `+5541988776655`
- Etiqueta saindo nos dois formatos (`X-ABLabel` + `TYPE`) e repetida nas Observações
- Foto: PNG quando cabe, queda automática para JPEG quando não (67 KB → 4,5 KB), aviso na
  tela quando nem o JPEG cabe
- Imagem: sem sobreposição de texto, sem transbordo lateral, nada fora da altura, nos cinco
  produtos
- Nome com vírgula e acento, placa antiga (`ABC-1234`) e Mercosul, campos opcionais vazios,
  seguradora sem WhatsApp, cartão sem seguradora nenhuma
- Nome de arquivo sem acento e com prefixo `EXEMPLO-` enquanto o catálogo for fictício

**Três defeitos apareceram nesse teste e estão corrigidos** — registrados porque nenhum
dos três dá erro na tela, todos falham calados:

1. *Configuração não salvava.* O código dependia do evento `close` do `<dialog>`, que não
   dispara em parte dos navegadores. Passou para o `submit` do formulário. De brinde, Esc
   e "Fechar" agora descartam, que é o comportamento esperado.
2. *Cartão gerado travava e o botão Enviar morria.* Duas atualizações simultâneas mexiam no
   mesmo canvas e uma invalidava a codificação da imagem da outra — o callback nunca voltava.
   As atualizações passaram a ser serializadas, a imagem é codificada de um canvas próprio,
   e qualquer falha reabilita o botão em vez de deixar o vendedor sem saída. Acontecia com
   digitação rápida, não é caso de laboratório.
3. *Logo grande era descartado em silêncio.* PNG de logo com degradê deu 67 KB, acima do
   teto que os importadores aceitam. Agora cai para JPEG (4,5 KB) e, se nem isso couber,
   avisa na tela.

**Só dá para fechar com aparelho na mão:**

- iPhone: importar na agenda, etiquetas certas, 0800 discando, foto aparecendo
- Android (Google Contatos): mesmos itens
- Android (Samsung Contatos): mesmos itens — importador diferente do Google
- Receber pelo WhatsApp iOS e pelo WhatsApp Android e salvar do zero
- Modo avião: app abre e gera normalmente

---

## 9. Decisões e pendências

**Riscos:**
- Etiqueta personalizada pode virar "Outro" em algum Android exótico → mitigado pela cópia
  nas Observações.
- Telefone de seguradora muda → o catálogo é editável pelo próprio vendedor, sem depender
  de programador.

**Preciso do seu irmão** (o app funciona sem isso, mas fica marcado como exemplo):
1. **A imagem que ele manda hoje** — é a fonte dos telefones. Não vou inventar 0800.
2. **Logo da Acionar** (PNG fundo transparente) e as cores da marca.
3. **Confirmar as seguradoras** do catálogo e apontar as que faltam.
4. **WhatsApp e nome dele** como corretor.
5. Um exemplo real de apólice (pode estar com dados trocados) para validar os campos.
