# ADR-009 — Segurança do webhook (HMAC)

**Status:** aceita · **Requisitos:** RF-01, RNF-04 · **Risco:** R-05

## Contexto
O responsável de TI não quer que ninguém de fora consiga disparar um "ganho" falso ([reunião 3](../../01-discovery/05-reuniao-3-responsavel-de-ti.md)). O endpoint da Ponte recebe dados que geram cobrança.

## Alternativas
1. **Chave de API em cabeçalho.** Simples, mas quem vê uma requisição (log, proxy) pode reutilizá-la, e não prova integridade do corpo.
2. **Lista de IPs permitidos.** Frágil e dependente de infraestrutura.
3. **mTLS.** Forte, mas pesado para dois sistemas simples.
4. **Assinatura HMAC-SHA256 do corpo, com timestamp.**

## Escolha
Opção 4:

- Cabeçalhos: `X-Timestamp` (segundos Unix), `X-Signature: sha256=<hex>`, `X-Event-Id`.
- Assinatura = `HMAC_SHA256(segredo, timestamp + "." + corpoBruto)`.
- A Ponte calcula sobre o **corpo bruto** (bytes recebidos), antes de interpretar o JSON.
- Comparação em **tempo constante** (`timingSafeEqual`).
- **Janela de 5 minutos** para o timestamp (`PONTE-AUTH-002`).
- Um segredo por origem (CRM e ERP), vindos de variáveis de ambiente; o serviço não sobe sem eles.
- **Replay dentro da janela** é neutralizado pela idempotência (ADR-003): o mesmo `X-Event-Id` não é processado de novo.
- Rotas administrativas usam outra credencial (`X-Admin-Key`), também por variável de ambiente.

## Motivo
Prova integridade e autoria do corpo sem expor o segredo, limita replay no tempo e é fácil de verificar em teste.

## Trade-off
Cada produtor precisa implementar a assinatura. Relógios desalinhados quebram a validação (janela de 5 min dá folga). **Rotação de segredo** não está implementada; no roadmap, a Ponte aceitaria dois segredos durante a troca.

## Quando eu mudaria de ideia
Para tráfego entre redes não confiáveis com muitos parceiros, eu adicionaria mTLS ou OAuth client-credentials na frente.
