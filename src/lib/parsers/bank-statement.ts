import { isBniStatement, parseBniStatement } from "./bni";
import { isBriStatement, parseBriStatement } from "./bri";
import { isJeniusStatement, parseJeniusStatement } from "./jenius";
import { isMandiriStatement, parseMandiriStatement } from "./mandiri";
import type { Transaction } from "./types";

const parsers = [
  { matches: isJeniusStatement, parse: parseJeniusStatement },
  { matches: isBniStatement, parse: parseBniStatement },
  { matches: isBriStatement, parse: parseBriStatement },
  { matches: isMandiriStatement, parse: parseMandiriStatement },
];

export const parseBankStatement = (text: string): Transaction[] => {
  const lines = text.split("\n");
  const parser = parsers.find((candidate) => candidate.matches(lines));
  return parser ? parser.parse(lines) : [];
};

export { parseCurrency } from "./currency";
export type { Transaction } from "./types";
