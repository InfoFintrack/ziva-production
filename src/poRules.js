// Shared by the order form and API so category and component rules stay consistent.
const KIDS_THREE_PIECE = 'Kids 3 Piece';
const COLOUR_LIST = [
  'Black','White','Red','Maroon','Navy Blue','Teal','Green','Mustard','Peach','Beige',
  'Brown','Purple','Pink','Cream','Off White','Burgundy','Lime Yellow','Sea Green','Blue',
  'Yellow','Orange','Grey','Silver','Gold','Ferozi','Skin','Rust','Mint','Ivory','Coral',
  'Black Karundi','Green Karundi','Brown Karundi','Cream Karundi','Mustard Karundi',
  'Burgundy Karundi','Purple Karundi','Pink Karundi','Blue Karundi','Red Karundi',
  'Maroon Karundi','Navy Karundi',
];
const isKidsThreePiece = value => String(value || '').trim().toLowerCase() === KIDS_THREE_PIECE.toLowerCase();
function garmentTypesWithKids(values = []) {
  return [...values.filter(value => !isKidsThreePiece(value)), KIDS_THREE_PIECE];
}
function normalizeColour(value) {
  const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
  return COLOUR_LIST.find(colour => colour.toLowerCase() === trimmed.toLowerCase()) || trimmed;
}
const isValidColour = value => normalizeColour(value).length >= 3 && /\p{L}/u.test(normalizeColour(value));
function validateKidsThreePiece(form) {
  if (!isKidsThreePiece(form.garment_type)) return '';
  for (const garment of ['shirt', 'trouser', 'dupatta']) {
    const label = garment[0].toUpperCase() + garment.slice(1);
    if (!isValidColour(form[`${garment}_colour`])) return `${label} needs a full colour name for Kids 3 Piece.`;
    if (!String(form[`${garment}_fabric`] || '').trim()) return `${label} Fabric Type is required for Kids 3 Piece.`;
    const quantity = Number(form[`${garment}_qty`]);
    if (!Number.isInteger(quantity) || quantity <= 0) return `${label} Quantity must be a positive whole number for Kids 3 Piece.`;
  }
  return '';
}
module.exports = { COLOUR_LIST, KIDS_THREE_PIECE, isKidsThreePiece, garmentTypesWithKids, normalizeColour, isValidColour, validateKidsThreePiece };
