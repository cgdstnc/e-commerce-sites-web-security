const [major] = process.versions.node.split(".").map(Number);

if (major < 24) {
  console.error(
    `\nThis package needs Node 24 or newer. This machine has ${process.version}.\n\n` +
      "The code is TypeScript and there is no build step, so Node has to strip the\n" +
      "types itself. Older versions cannot do that, or need a flag.\n\n" +
      "Node 24: https://nodejs.org/en/download\n",
  );
  process.exit(1);
}
