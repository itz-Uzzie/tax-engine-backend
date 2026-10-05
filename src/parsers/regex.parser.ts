export function parseWithRegex(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)%\s*(of value of supplies|sales tax|standard)/i);
  return match ? Number(match[1]) : null;
}
