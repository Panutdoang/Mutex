export const parseCurrency = (value: string): number => {
  if (!value) return 0;

  if (value.includes(",") && value.includes(".")) {
    const lastDot = value.lastIndexOf(".");
    const lastComma = value.lastIndexOf(",");
    if (lastComma > lastDot) {
      return parseFloat(value.replace(/\./g, "").replace(",", "."));
    }
  }

  return parseFloat(
    value.replace(/[,.]/g, (_match, offset, string) => {
      if (string.length - offset <= 3) {
        return ".";
      }
      return "";
    })
  );
};
