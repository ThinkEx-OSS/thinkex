case | claude-sonnet| claude-haiku | gpt-luna | gemini-pro
--------------------------------------------------------------------------------------------------------

document: study sheet with formulas | PASS | PASS | PASS | PASS  
document: exponents and subscripts in prose | PASS | PASS | PASS | PASS  
document: chemistry equation | FAIL | PASS | PASS | PASS  
document: prices only (currency must stay pl| PASS | PASS | PASS | PASS  
document: money AND math together (opposite | PASS | FAIL | PASS | PASS  
chat: explain a formula | PASS | PASS | PASS | PASS  
chat: money question | PASS | PASS | PASS | PASS  
chat: money and math in one answer | PASS | PASS | FAIL | FAIL  
widget: interactive with a formula | PASS | PASS | PASS | PASS  
document: user types dollar math in the prom| PASS | PASS | PASS | PASS  
document: user types bracket math in the pro| PASS | PASS | PASS | PASS  
document: editing an existing doc adds an eq| FAIL tool✗ | FAIL tool✗ | FAIL tool✗ | FAIL tool✗

claude-sonnet 10/12 content rules satisfied
claude-haiku 10/12 content rules satisfied
gpt-luna 10/12 content rules satisfied
gemini-pro 10/12 content rules satisfied

document 26/32 across all models
chat 10/12 across all models
widget 4/4 across all models

failures

[claude-sonnet] document: chemistry equation
must not contain <sub>/<sup> tags
--- wrote: document
/Methane Combustion
<h1>Methane Combustion</h1><p>Methane (CH<sub></sub>) is the simplest hydrocarbon and the main component of natural gas. When it burns, it reacts with oxygen in a process called <strong>combustion</strong>, releasing energy as heat and light.</p><h2>Complete Combustion</h2><p>With plentiful oxygen, methane burns completely to form carbon dioxide and water vapor:</p><div data-type="block-math" data-latex="\ce{CH4 + 2 O2 -> CO2 + 2 H2O}"></div><p>This reaction is <strong>exothermic</strong>, meaning it releases energy. This is why methane (natural gas) is used as a f…

[claude-haiku] document: money AND math together (opposite dollar rules)
must not contain backslash-escaped \$
--- wrote: document
/Compound Interest Guide
<h1>Compound Interest</h1>

<h2>What is Compound Interest?</h2>
<p>Compound interest is interest earned on both the principal amount and the accumulated interest from previous periods. This creates exponential growth over time, making it a powerful tool for long-term investments and savings.</p>

<h2>The Compound Interest Formula</h2>
<p>The standard formula for compound interest is:</p>
<div data-type="block-math" data-latex="A = P\left(1 + \frac{r}{n}\right)^{nt}"></div>

<p>Where:</p>
<ul>
<li><strong>A</strong> = Final amount (principal + interest)</li>
<l…

[gpt-luna] chat: money and math in one answer
must not contain \(…\) or \[…\] delimiters
--- wrote: With annual compounding:

\[
A = 2000(1.05)^3 = \$2{,}315.25
\]

You’d end up with **\$2,315.25**, earning **\$315.25** in interest.

[gemini-pro] chat: money and math in one answer
must not contain unescaped $30-style amount
--- wrote: You will end up with **\$2,315.25**.

Here is the breakdown using the compound interest formula $A = P(1 + r)^t$:

- **Principal ($P$):** \$2,000
- **Interest Rate ($r$):** 5% or $0.05$
- **Time ($t$):** 3 years

$$A = 2000 \times (1 + 0.05)^3$$
$$A = 2000 \times 1.157625$$
$$A = 2315.25$$

Your total interest earned over the 3 years will be **\$315.25**.

[claude-sonnet] document: editing an existing doc adds an equation
no workspace_edit_item input to grade

[claude-haiku] document: editing an existing doc adds an equation
no workspace_edit_item input to grade

[gpt-luna] document: editing an existing doc adds an equation
no workspace_edit_item input to grade

[gemini-pro] document: editing an existing doc adds an equation
no workspace_edit_item input to grade
