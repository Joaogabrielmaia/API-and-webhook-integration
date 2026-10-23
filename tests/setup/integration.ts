import { prepareDatabases } from "./db";

export default async function setup(): Promise<void> {
  await prepareDatabases("integration");
}
