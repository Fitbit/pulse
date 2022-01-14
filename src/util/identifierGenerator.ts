export default function identifierGenerator(
  initial = 0,
  max = 255,
): () => number {
  let current = initial;
  return () => {
    const identifier = current;
    current = (current + 1) % (max + 1);
    return identifier;
  };
}
