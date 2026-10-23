# ADR-004 — Retentativa com backoff exponencial

**Status:** aceita · **Requisitos:** RF-08, RNF-03 · **Regras:** RN-09

## Contexto
O ERP fica indisponível cerca de 2 horas por dia. Falhas temporárias precisam se resolver sozinhas; falhas permanentes não devem ser retentadas.

## Alternativas
1. **Intervalo fixo** (ex.: a cada 30 s): simples, mas ou gasta muitas tentativas na janela, ou espera demais quando a falha é curta.
2. **Backoff exponencial com teto e variação aleatória (jitter).**
3. **Sem retentativa automática:** tudo vai à fila de falhas. Exige trabalho manual para qualquer soluço.

## Escolha
Opção 2:

`espera(n) = min(teto, base × 2^(n−1)) × (1 ± 20%)`, com `base = 30 s`, `teto = 30 min`, `n` = número da tentativa que acabou de falhar, até **12 tentativas**.

| Falha nº | 1 | 2 | 3 | 4 | 5 | 6 | 7 a 11 |
|---|---|---|---|---|---|---|---|
| Espera | 30 s | 60 s | 120 s | 240 s | 480 s | 960 s | 1.800 s (teto) |

Soma das esperas: 30 + 60 + 120 + 240 + 480 + 960 + 5 × 1.800 = **10.890 s ≈ 3 h 01 min**. No pior caso do jitter (−20%): 8.712 s ≈ **2 h 25 min**, ainda acima da janela de 2 h.

**Classificação (RN-09):** temporário = erro de rede, timeout, HTTP 5xx, 408, 429; permanente = validação e 4xx restantes.

## Motivo
O crescimento exponencial dá respostas rápidas a falhas curtas e preserva o ERP quando a falha é longa; o teto de 30 min evita esperas absurdas; o jitter evita que muitos eventos acordem juntos e derrubem o ERP de novo ao voltar (efeito manada).

## Trade-off
Em falha longa, o evento só é reavaliado a cada 30 min no fim; isso é aceitável para cobrança, não para fluxo em tempo real. O jitter torna o tempo exato imprevisível (os testes injetam o gerador de números).

## Quando eu mudaria de ideia
- Se a janela de indisponibilidade aumentasse, eu aumentaria `RETRY_MAX_ATTEMPTS` e não o teto.
- Se o ERP tivesse cabeçalho `Retry-After`, a Ponte o respeitaria.
- Nos testes e nas demonstrações, uso `base` de dezenas de milissegundos para ver a sequência em segundos; a política de produção do estudo é a da tabela.
