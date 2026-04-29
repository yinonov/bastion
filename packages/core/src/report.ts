import type { DashboardSummary } from "./schemas.js";

export function renderMarkdownReport(summary: DashboardSummary): string {
  const lines = [
    "# Bastion AI Workflow Audit",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "## Risk Command Center",
    "",
    `- Risk score: ${summary.riskScore}/100`,
    `- Events observed: ${summary.totals.events}`,
    `- Blocked actions: ${summary.totals.blocked}`,
    `- Secret findings: ${summary.totals.secrets}`,
    `- Friction clusters: ${summary.totals.frictionClusters}`,
    `- Estimated shadow AI spend: $${summary.totals.estimatedSpendUsd.toFixed(2)}`,
    "",
    "## Top Security Findings",
    ""
  ];

  if (summary.findings.length === 0) {
    lines.push("No security findings recorded.");
  } else {
    for (const finding of summary.findings.slice(0, 10)) {
      lines.push(`- **${finding.severity.toUpperCase()}** ${finding.title}: ${finding.recommendation}`);
    }
  }

  lines.push("", "## Developer Friction Insights", "");
  if (summary.insights.length === 0) {
    lines.push("No developer insights generated yet.");
  } else {
    for (const insight of summary.insights.slice(0, 10)) {
      lines.push(`- **${insight.title}**: ${insight.recommendation}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
