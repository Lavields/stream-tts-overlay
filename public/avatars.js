export const countryAvatars = [
  { id: "cat-peru", name: "Gato Perú", desc: "Hincha peruano con camiseta blanca y franja roja", color: "#d73535" },
  { id: "cat-chile", name: "Gato Chile", desc: "Camiseta roja y banderas de Chile", color: "#d93840" },
  { id: "cat-argentina", name: "Gato Argentina", desc: "Camiseta albiceleste y banderas argentinas", color: "#73bce8" },
  { id: "cat-bolivia", name: "Gato Bolivia", desc: "Camiseta verde y colores de Bolivia", color: "#2a9a66" },
  { id: "cat-mexico", name: "Gato México", desc: "Camiseta verde y banderas mexicanas", color: "#168365" },
  { id: "cat-colombia", name: "Gato Colombia", desc: "Camiseta amarilla y banderas de Colombia", color: "#efc42d" },
  { id: "cat-venezuela", name: "Gato Venezuela", desc: "Camiseta vinotinto y bandera venezolana", color: "#9e3044" },
  { id: "cat-espana", name: "Gato España", desc: "Camiseta roja con detalles dorados y banderas españolas", color: "#d94332" },
  { id: "cat-japon", name: "Gato Japón", desc: "Camiseta azul y banderas de Japón", color: "#3360bb" },
  { id: "cat-corea-del-sur", name: "Gato Corea del Sur", desc: "Camiseta roja y banderas surcoreanas", color: "#ef575e" },
];
export const characterAvatars = [
  {
    "id": "cat-calvo",
    "name": "Gato Calvo",
    "desc": "Gato masculino de pelaje crema uniforme, calvo y con polerón azul",
    "color": "#647fa3"
  },
];
export const avatars = [
  { id: "chibi-ruby", name: "Chibi Rubí", desc: "Cabello rojo, lentes y un collar de corazón", color: "#d97592" },
  { id: "cat-black", name: "Gatito Noche", desc: "Pelaje negro y grandes ojos verdes", color: "#8eb581" },
  { id: "cat-calico", name: "Gatita Tricolor", desc: "Pelaje tricolor, collar verde y sonrisa alegre", color: "#e2b381" },
  { id: "cat-tabby", name: "Gatito Miel", desc: "Atigrado esponjoso con una cola enroscada", color: "#dbad76" },
  { id: "chibi-black", name: "Chibi Caos", desc: "Cabello despeinado, ropa negra y una gran sonrisa", color: "#b5a4e8" },
  {
    id: "sock",
    name: "Calcetín Arcoíris",
    desc: "Tejido, pelo de lana y mucha energía",
    color: "#eeb465",
  },
  {
    id: "male",
    name: "Títere Rockero",
    desc: "Cabello castaño y chaqueta de mezclilla",
    color: "#8ba7c5",
  },
  {
    id: "female",
    name: "Títere Rosa",
    desc: "Cabello largo, encaje y lazo de perla",
    color: "#e7a5c5",
  },
  ...countryAvatars,
  ...characterAvatars,
];
export function normalizeAvatar(id) {
  return (
    {
      potato: "sock",
      "sock-m": "sock",
      "sock-f": "female",
      "canadian-m": "male",
      "canadian-f": "female",
    }[id] || (avatars.some((a) => a.id === id) ? id : "sock")
  );
}
export function avatarSVG(id = "sock") {
  const a = avatars.find((a) => a.id === normalizeAvatar(id));
  return `<div role="img" aria-label="${a.name}" class="character puppet-sprite" style="background-image:url('/assets/avatars/${a.id}-sprites.png')"></div>`;
}
export function setMouth(root, level) {
  root.classList.toggle("talking", level > 0.06);
}
export function blink(root) {
  root.classList.add("blinking");
  return new Promise((resolve) =>
    setTimeout(() => {
      root.classList.remove("blinking");
      resolve();
    }, 220),
  );
}
