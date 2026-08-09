# Manual: cadastrar telefones e dados das seguradoras

Este é o único cadastro do app que importa de verdade. Todo o resto — nome do cliente,
placa, vigência — é digitado na hora e conferido na hora. Os telefones são a única coisa
que o cliente vai usar **meses depois**, no pior dia do ano dele, sem ninguém por perto
para corrigir. Por isso o app trava, avisa e marca tanto.

Leia a seção [**9. A regra que não se quebra**](#9-a-regra-que-não-se-quebra), no fim. É a
única parte que não é sobre onde tocar.

**Pela tela do app**, que é o caminho normal:

1. [Onde fica](#1-onde-fica)
2. [A lista](#2-a-lista)
3. [O cabeçalho da empresa](#3-o-cabeçalho-da-empresa)
4. [Os telefones](#4-os-telefones) — e os dois avisos vermelhos
5. [“Já liguei em todos estes números”](#5-já-liguei-em-todos-estes-números)
6. [Salvar, cancelar, excluir, restaurar](#6-salvar-cancelar-excluir-restaurar)
7. [Por que você tem de me mandar o arquivo](#7-por-que-você-tem-de-me-mandar-o-arquivo)

**No arquivo**, para quem publica:

8. [Editando o `data/seguradoras.json` direto](#8-editando-o-dataseguradorasjson-direto)
9. [A regra que não se quebra](#9-a-regra-que-não-se-quebra)

O resto do app está no [README](README.md).

## 1. Onde fica

Dois caminhos, os dois abrem a mesma tela:

- passo 2, botão **Cadastrar telefones e logo das seguradoras**
  (em Consórcio o botão diz *administradoras*, porque não são a mesma coisa);
- a faixa creme do topo, *"Telefones não conferidos"*, botão **Cadastrar**.

## 2. A lista

Aparecem **todas as entradas do catálogo** (22 hoje), não só as do produto aberto — dá para
corrigir uma administradora de consórcio sem sair do Auto. As que servem o produto aberto vêm
primeiro;
as outras ficam apagadas e recuadas, com *"Só para Consórcio"* embaixo do nome. Isso existe
porque *Porto Seguro* e *Porto Seguro Consórcio* são duas linhas quase idênticas na lista, e
editar a errada é fácil.

Embaixo do nome, em cinza ou em **vermelho**:

| O que diz | Significa |
|---|---|
| `3 telefones conferidos` | alguém ligou. Cartão sai limpo. |
| `4 telefones — não conferidos` | **vermelho.** Cartão sai marcado EXEMPLO. |
| `nenhum telefone cadastrado` | a entrada existe e está vazia |

**Nova seguradora** cria uma do zero — ela nasce **não conferida**, com a caixa do fim do
formulário desmarcada. **Editar** abre a que você tocou.

## 3. O cabeçalho da empresa

| Campo | O que fazer |
|---|---|
| **Nome** | obrigatório. É o que aparece na lista do passo 2, no selo do cartão e na frente de cada telefone na agenda do cliente. |
| **Site** | opcional. Vira um item "Site" no contato da agenda. |
| **Aparece em** | **Seguros**, **Consórcio** ou **Todos os produtos**. Leia abaixo. |
| **Logo** | opcional. PNG de fundo transparente, **na variante escura da marca**. |

**"Aparece em" não é detalhe de organização.** Administradora de consórcio não é seguradora:
são pessoas jurídicas distintas, com CNPJ e telefones próprios, mesmo quando o nome coincide
— *Porto Seguro Administradora de Consórcios* não é a *Porto Seguro Companhia de Seguros
Gerais*. Marcar errado faz a empresa aparecer como opção no produto errado, e aí o cartão de
uma cota de imóvel sai com o telefone de reboque de uma seguradora que não tem nada a ver
com ela.

**Por que o logo tem de ser a variante escura:** o cartão é branco. Logo claro desaparece —
o amarelo da Yelum é o caso limite. Sem logo o cartão escreve o nome, o que funciona para
qualquer marca — 10 das 22 entradas estão assim hoje, sem prejuízo nenhum. O app reduz a
imagem para no máximo 512px e guarda como PNG. Se você subir um **SVG sem largura e altura
declaradas dentro do arquivo**, ele recusa e explica — antes gravava um logo de 1×1 pixel sem dizer
nada.

## 4. Os telefones

**+ telefone** acrescenta um bloco. Cada bloco tem cinco controles:

| Controle | Onde aparece | Como escrever |
|---|---|---|
| **Número** | na imagem, no contato e na página do link | como você escreveria para um cliente: `0800 701 4120`, `(11) 3132 1001`. O app converte para o formato que o aparelho disca. |
| **Rótulo na imagem** | na **imagem** do cartão | as palavras da própria seguradora. Aqui há espaço e cabeçalho. |
| **Rótulo curto na agenda** | no **contato** e na **página do link** | curto. Vai prefixado com o nome da empresa: `Yelum Capital e RM`. Opcional — sem ele, usa o rótulo da imagem. |
| **Tipo** | define a **ordem** no cartão | ver a tabela abaixo |
| **Não virar telefone clicável** | — | ver [*O aviso vermelho de número de central*](#o-aviso-vermelho-de-número-de-central) |

**Por que existem dois rótulos.** Na agenda do celular o rótulo comprido aparece cortado no
meio — *"Capital e Região Metro…"* — e o cliente não sabe de quem é aquele número. Com a
marca na frente e o texto curto, ele lê `Yelum Capital e RM` inteiro. Na imagem do cartão o
espaço é outro, e lá vale o texto completo da seguradora.

### A ordem no cartão vem do tipo

O que vem primeiro é o que o cliente precisa na pior hora.

| Tipo | Ordem |
|---|---|
| Assistência / reboque | 1º |
| Aviso de sinistro · Central de atendimento (consórcio) | 2º |
| SAC | 3º |
| WhatsApp | 4º |
| Ouvidoria | 5º |
| Outro | 6º |

*Central de atendimento* existe para consórcio, que não tem sinistro nem reboque: o
equivalente é a central que resolve boleto, assembleia e contemplação. Ela ocupa a mesma
posição do aviso de sinistro.

### O bloco vermelho "Não conferido — tirei do site"

Aparece hoje em 62 dos 78 telefones do catálogo. É a **procedência**: o trecho de texto que
estava em volta do número na página da seguradora, e um link **abrir a página** para você
conferir na fonte.

O aviso embaixo dele — *"O texto acima pode se referir a outro número da mesma página"* — é
literal. A raspagem pega o número certo e às vezes a frase do número vizinho. Trate o trecho
como pista, não como verdade.

O bloco desaparece em dois casos, e só nesses dois:

- você marca **"Já liguei em todos estes números"**;
- você **muda aquele número** — aí o texto capturado passa a se referir a outro número, e
  virou mentira.

Corrigir o *site* da empresa, o nome ou outro telefone **não** apaga a procedência dos
demais. Antes apagava, e uma gravação qualquer levava embora a única pista de onde os
números tinham vindo.

### O aviso vermelho de número de central

Se você digitar um número que parece central — **3003, 3004, 4002, 4003, 4004, 4020, 4062**
— e a caixa *"Não virar telefone clicável"* estiver **desmarcada**, acende um aviso vermelho
embaixo do campo.

Isto é o problema mais concreto de todo o app, e já aconteceu:

> `4004 5423` virou, na agenda de um cliente, um **celular de DDD 47 que pertence a uma
> pessoa de verdade** — apareceu no contato com o nome e a foto dela. Um cliente batido no
> acostamento ligaria para uma estranha achando que era a seguradora.

O app faz a parte dele: `4004 5423` e `(11) 4004-5423` são discados em formato nacional, sem
`+55`. Mas o **Android reescreve números na importação do contato**, e isso o app não
controla. Quem sabe se aquele `(11) 3003-1234` é central ou fixo de verdade é você, não o
app — por isso ele aponta e explica, e a decisão fica com você.

**Marcada**, a caixa faz o número:

- continuar na imagem do cartão, para o cliente digitar à mão;
- continuar nas observações do contato, com `(digite à mão)` na frente;
- aparecer na página do link **sem virar toque**, com a instrução de digitar;
- **não** virar linha de telefone no arquivo do contato.

Número errado na agenda é pior que número ausente. `0800` sobrevive intacto e pode ser
telefone normal.

## 5. "Já liguei em todos estes números"

É esta caixa que tira o EXEMPLO. Enquanto ela estiver desmarcada, **cinco coisas** avisam:

1. a imagem sai com **EXEMPLO** atravessado e *"telefones não conferidos"* embaixo;
2. o arquivo do contato vem com `EXEMPLO-` no nome;
3. as observações do contato abrem com
   `*** CARTÃO DE EXEMPLO — TELEFONES NÃO CONFERIDOS, NÃO USE ***`;
4. o passo 4 mostra um aviso amarelo dizendo **de qual empresa** é o problema;
5. a página do link mostra faixa vermelha ao cliente, **não deixa nenhum número virar
   toque** e esconde o botão de salvar na agenda. Os telefones da Acionar continuam
   clicáveis, que é para onde esse cliente deve ligar.

Nada disso impede o envio — testar com exemplo é uso legítimo. O que não existe mais é o
silêncio.

**Marque só depois de ligar em cada número.** Não é formalidade: é a única coisa que separa o
cliente de um telefone de sinistro errado.

Se você marcar a caixa numa empresa **sem telefone nenhum**, o app recusa e explica.

## 6. Salvar, cancelar, excluir, restaurar

- **Salvar** — grava, volta para a lista e **já seleciona** aquela empresa no passo 2.
  Telefone com o número em branco é descartado sem aviso. Telefone sem rótulo recebe
  *"Atendimento"*.
- **Cancelar** — descarta tudo, inclusive telefones que você acabou de acrescentar.
- **Excluir esta seguradora** — pede confirmação. Some da lista do passo 2.
- **Restaurar** — no fim da lista aparece a seção **"Excluídas por você"**, com um botão por
  empresa. Excluir não é definitivo. (Antes era: a única saída seria apagar os dados do
  site, o que levaria junto suas configurações e seu histórico.)

O que você edita **sobrepõe** o catálogo do projeto, não substitui. Assim eu continuo podendo
publicar uma seguradora nova ou corrigir um telefone na base sem apagar o seu trabalho — e o
que você editou continua vencendo. O app guarda **só a diferença**: campo que você não tocou
continua vindo do projeto e recebe correção.

## 7. Por que você tem de me mandar o arquivo

**Isto não é opcional, e é a parte que mais surpreende.**

O que você cadastra fica **só neste aparelho**, no armazenamento do navegador. A página do
link que o cliente recebe é pública: ela lê o catálogo **publicado** no site, e não tem como
enxergar o que está no seu celular. Então:

| Você faz | O cartão (imagem + contato) | O link do cliente |
|---|---|---|
| corrige um telefone pela tela | sai **certo** | mostraria o **antigo** |
| cria uma seguradora nova | sai certo | diria *"não encontrei esta seguradora"* |
| marca "já liguei" | sai limpo | avisaria que não foi conferido |

Nos dois primeiros casos o app **deixa o link fora da mensagem** e explica no passo 4, com
um aviso. A imagem e o contato vão completos — mensagem sem link é melhor que link mentindo.
No terceiro o link vai, e o aviso diz o que o cliente vai ver.

Para o link voltar a funcionar, o catálogo precisa ser publicado:

1. **Cadastrar** → **Backup do catálogo** → **Exportar**;
2. sai um `seguradoras.json` em Downloads;
3. me mande esse arquivo.

Aí passa a valer em qualquer celular, sobrevive a trocar de aparelho, e o link do cliente
volta a entrar na mensagem.

**Importar** faz o caminho de volta, e é **destrutivo**: substitui tudo que está cadastrado
neste aparelho pelo conteúdo do arquivo. Pede confirmação com a contagem antes.

## 8. Editando o `data/seguradoras.json` direto

O jeito de quem publica. Uma entrada completa, a da Yelum, que é a única conferida:

```json
{
  "id": "yelum",
  "nome": "Yelum",
  "exemplo": false,
  "produtos": ["auto", "moto", "residencial", "vida", "empresarial"],
  "logo": "assets/seguradoras/yelum.png",
  "site": "https://www.yelumseguros.com.br",
  "telefones": [
    {
      "rotulo": "Capital e Região Metropolitana",
      "rotuloCurto": "Capital e RM",
      "numero": "4004 5423",
      "tipo": "assistencia",
      "semTel": true
    },
    {
      "rotulo": "Demais Regiões",
      "rotuloCurto": "Demais Regiões",
      "numero": "0800 701 4120",
      "tipo": "assistencia"
    }
  ]
}
```

| Campo | Obrigatório | Para que serve |
|---|---|---|
| `id` | sim | só minúscula, número e hífen. É o que viaja no link do cliente (`/t/#yelum`). |
| `nome` | sim | o que o cliente vê |
| `exemplo` | sim | `true` = telefones não conferidos. Ver a seção 5. |
| `produtos` | não | lista de produtos. **Sem a chave, aparece em todos.** Consórcio usa `["consorcio"]`; seguro usa os cinco. |
| `logo` | não | caminho relativo (`assets/seguradoras/x.png`) ou `data:`. Sem ele, o cartão escreve o nome. |
| `site` | não | vira item no contato da agenda |
| `telefones` | sim | lista, na ordem que você quiser — quem ordena o cartão é o `tipo` |

E dentro de cada telefone:

| Campo | Obrigatório | Para que serve |
|---|---|---|
| `numero` | sim | como você escreveria para um cliente |
| `rotulo` | sim | vai na **imagem** |
| `rotuloCurto` | não | vai no **contato** e na **página do link**, prefixado com o nome da empresa |
| `tipo` | na prática, sim | `assistencia`, `sinistro`, `atendimento`, `sac`, `whatsapp`, `ouvidoria`, `outro`. Sem ele o app não reclama, mas o telefone vai para o fim da lista do cartão. |
| `semTel` | não | `true` = aparece, mas não vira telefone clicável |
| `_contexto` `_fonte` | não | procedência da raspagem. O editor mostra em vermelho. Mantenha até alguém ligar. |

Chaves começando com `_` no nível da seguradora são comentários e o app ignora — é onde estão
as notas de cada entrada hoje.

**Duas coisas sobre o `id`, que é o único campo irreversível:**

- **Nunca mude um id já publicado.** Ele é o endereço do cartão do cliente
  (`/t/#yelum`). Trocar quebra, de uma vez, todos os links já enviados — e não há como
  saber quais foram.
- **Só minúscula, número e hífen.** A página do link testa esse formato e recusa o resto;
  um id com maiúscula ou acento faz o cliente ler *"não encontrei esta seguradora"*.
  Quando você cria pela tela, o app gera o id sozinho a partir do nome e já no formato
  certo — o cuidado é para quem edita o arquivo à mão.

Você pode liberar **uma por vez**: Porto hoje, Azul na semana que vem. Quem sobrar com
`"exemplo": true` continua marcada, sozinha.

Depois de mexer no JSON, publique — `python build.py`, commit e push. Ver
[Como publicar](README.md#como-publicar), no README.
Os JSON de `data/` são exceção no cache: vão sempre pela rede, então telefone de seguradora
atualiza **sem** precisar subir a versão do app.

## 9. A regra que não se quebra

**O rótulo tem de ser o que a seguradora publica.** Não o que ficaria mais bonito no cartão.

A Yelum separa os telefones por **região** — *Capital e Região Metropolitana*, *Demais
Regiões* — e não por finalidade. É tentador trocar isso por "Sinistro" e "Assistência 24h",
que ficam mais simétricos e mais parecidos com o resto do catálogo. **Não troque.** Se o
cliente ligar num número achando que é outra coisa, o cartão não deixou de ajudar: ele piorou
a situação, porque o cliente confiou nele.

Vale para o resto do cadastro pela mesma razão. Um telefone que você não conferiu, marcado
como conferido, é a única maneira de esse app causar um problema de verdade — todo o resto
que ele faz de errado dá para desfazer digitando de novo.
