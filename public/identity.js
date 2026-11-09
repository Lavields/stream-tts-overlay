export function identity(platform, user) {
  const name = String(user).trim().replace(/^@/, "");
  return `${platform}:${platform === "youtube" ? name : name.toLowerCase()}`;
}
