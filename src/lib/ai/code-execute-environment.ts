export function buildCodeExecuteToolDescription(): string {
  return [
    "Execute Python code in an E2B cloud sandbox.",
    "Use for math, data analysis, charts (matplotlib/seaborn/plotly), simulations, or any computation.",
    "You can pip install packages. Charts rendered with matplotlib/seaborn are auto-captured.",
    "Write complete runnable Python code. Use print() to output results.",
  ].join(" ");
}

export function getCodeExecutionSystemInstructions(): string {
  return `CODE EXECUTION (code_execute):
Use code_execute when: exact arithmetic or algebra verification, numerical simulation, statistical analysis, parsing/transforming structured data in Python, matplotlib/seaborn/plotly charts, or multi-step computation where mistakes are likely without execution.
Do NOT use for: tasks that are pure explanation with no computation benefit, or when the user only wants code snippets to run locally (answer in chat instead).
The sandbox is an E2B cloud environment running Python. You can pip install any package. Common libraries like numpy, pandas, matplotlib, scipy, seaborn are available by default.
Charts: matplotlib/seaborn plots are auto-captured and displayed to the user inline. Always call plt.show() at the end of plotting code.
For workspace data, use workspace_read first, then embed the needed data directly in your Python code as a variable.
Write complete, self-contained Python code in the \`code\` parameter. Use print() for text output. Do not assume any prior execution state — each call gets a fresh sandbox.
After the tool returns, explain results to the user in plain language without naming this tool or exposing raw tool JSON.`;
}
