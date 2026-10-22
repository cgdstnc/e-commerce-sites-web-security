import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const rel = (file: string) => path.relative(root, file);

export const RAW = path.join(root, "raw_data");
export const OUT = path.join(root, "out");
export const EXPECTED = path.join(root, "expected");
