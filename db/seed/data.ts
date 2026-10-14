// Demonstration marketplace for Lakewood, Ohio.
// Every merchant here is FICTIONAL and flagged is_demo = true. None represents a real business.
// Photos are Unsplash-licensed stock images used as placeholders.

export type Avail = 'in_stock' | 'low_stock' | 'out_of_stock' | 'available';

export interface SeedProduct {
  key: string;            // also the image key
  name: string;
  description: string;
  category: string;       // category slug
  tags: string[];
  variations: [string, number, Avail?, number?][]; // name, price cents, availability, quantity
  modifiers?: string[];   // modifier list keys
  taxable?: boolean;
  featured?: boolean;
}

export interface SeedMerchant {
  slug: string;
  name: string;
  category: string;
  cover: string;
  description: string;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  hours: Record<string, [string, string][]>;
  prepMinutes: number;
  products: SeedProduct[];
}

const wk = (o: string, c: string, days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) =>
  Object.fromEntries(days.map((d) => [d, [[o, c]] as [string, string][]]));

export const CATEGORIES = [
  { slug: 'food', name: 'Food' },
  { slug: 'coffee', name: 'Coffee' },
  { slug: 'flowers', name: 'Flowers' },
  { slug: 'groceries', name: 'Groceries' },
  { slug: 'gifts', name: 'Gifts' },
  { slug: 'home', name: 'Home' },
  { slug: 'plants', name: 'Plants' },
  { slug: 'books', name: 'Books' },
];

export const MODIFIER_LISTS: Record<string, { name: string; selection: 'single' | 'multiple'; min: number; max: number | null; options: [string, number, boolean?][] }> = {
  milk: { name: 'Milk', selection: 'single', min: 1, max: 1, options: [['Whole milk', 0, true], ['Oat milk', 75], ['Almond milk', 75], ['Skim milk', 0]] },
  shots: { name: 'Extras', selection: 'multiple', min: 0, max: 3, options: [['Extra shot', 100], ['Vanilla syrup', 60], ['Light ice', 0]] },
  burger: { name: 'Toppings', selection: 'multiple', min: 0, max: 5, options: [['Pickles', 0, true], ['Grilled onions', 0], ['Bacon', 250], ['Jalapeños', 75], ['Extra cheese', 150]] },
  card: { name: 'Add a card', selection: 'single', min: 0, max: 1, options: [['Handwritten note card', 400]] },
};

export const MERCHANTS: SeedMerchant[] = [
  {
    slug: 'low-tide-coffee', name: 'Low Tide Coffee', category: 'coffee', cover: 'cover_coffee',
    description: 'A small espresso bar roasting single-origin beans in house, a few blocks from the lake.',
    neighborhood: 'Birdtown', address: '1400 Madison Ave', lat: 41.4766, lng: -81.7719, phone: '(216) 555-0141',
    hours: wk('06:30', '17:00'), prepMinutes: 8,
    products: [
      { key: 'iced_latte', name: 'Iced Vanilla Latte', description: 'Double espresso, house vanilla syrup and cold milk over ice.', category: 'coffee', tags: ['latte', 'iced', 'espresso', 'drink', 'vanilla'], variations: [['12 oz', 525], ['16 oz', 595]], modifiers: ['milk', 'shots'], featured: true },
      { key: 'cappuccino', name: 'Cappuccino', description: 'Equal parts espresso, steamed milk and foam.', category: 'coffee', tags: ['espresso', 'hot', 'drink'], variations: [['8 oz', 475]], modifiers: ['milk', 'shots'] },
      { key: 'cold_brew', name: 'Cold Brew', description: 'Steeped for 18 hours. Smooth, chocolatey, strong.', category: 'coffee', tags: ['iced', 'cold', 'drink'], variations: [['12 oz', 450], ['16 oz', 525]], modifiers: ['shots'] },
      { key: 'breakfast_sandwich', name: 'Breakfast Sandwich', description: 'Folded egg, sharp cheddar and bacon on a toasted brioche bun.', category: 'food', tags: ['breakfast', 'sandwich', 'egg', 'bacon'], variations: [['Bacon, egg & cheddar', 750], ['Egg & cheddar', 650]], featured: true },
      { key: 'coffee_beans', name: 'Locally Roasted Coffee Beans', description: 'Our house blend, roasted in Lakewood every Tuesday. Notes of cocoa and cherry.', category: 'coffee', tags: ['beans', 'roasted', 'gift', 'local', 'bag'], variations: [['12 oz whole bean', 1700, 'in_stock', 24], ['12 oz ground', 1700, 'low_stock', 3]], taxable: false, featured: true },
      { key: 'muffin', name: 'Blueberry Muffin', description: 'Baked every morning with wild blueberries and a sugar crust.', category: 'food', tags: ['pastry', 'breakfast', 'muffin'], variations: [['Each', 375, 'in_stock', 9]] },
    ],
  },
  {
    slug: 'rise-and-crumb', name: 'Rise & Crumb Bakery', category: 'food', cover: 'cover_bakery',
    description: 'Naturally leavened bread, laminated pastries and cookies, baked before sunrise.',
    neighborhood: 'Downtown Lakewood', address: '15200 Detroit Ave', lat: 41.4822, lng: -81.7990, phone: '(216) 555-0172',
    hours: wk('07:00', '15:00', ['tue', 'wed', 'thu', 'fri', 'sat', 'sun']), prepMinutes: 5,
    products: [
      { key: 'sourdough', name: 'Country Sourdough Loaf', description: 'Three-day ferment, crackly crust, open crumb. About 900 g.', category: 'food', tags: ['bread', 'sourdough', 'loaf', 'bakery'], variations: [['Whole loaf', 900, 'in_stock', 14]], taxable: false, featured: true },
      { key: 'cookies', name: 'Chocolate Chip Cookies', description: 'Brown butter dough, dark chocolate chunks and flaky salt.', category: 'food', tags: ['cookies', 'dessert', 'sweet', 'treat', 'bakery'], variations: [['Half dozen', 1200, 'in_stock', 10], ['Dozen', 2200, 'in_stock', 6]], taxable: false, featured: true },
      { key: 'croissant', name: 'Almond Croissant', description: 'Twice-baked butter croissant with almond frangipane.', category: 'food', tags: ['pastry', 'breakfast', 'croissant', 'bakery'], variations: [['Each', 500, 'low_stock', 4]], taxable: false },
      { key: 'morning_bun', name: 'Cinnamon Morning Bun', description: 'Croissant dough rolled with cinnamon sugar and orange zest.', category: 'food', tags: ['pastry', 'breakfast', 'sweet', 'bakery'], variations: [['Each', 450, 'in_stock', 12]], taxable: false },
      { key: 'rye', name: 'Seeded Rye', description: 'Dense, nutty rye with caraway, sunflower and flax.', category: 'food', tags: ['bread', 'loaf', 'rye', 'bakery'], variations: [['Whole loaf', 1000, 'in_stock', 6]], taxable: false },
      { key: 'cake', name: 'Six-Inch Birthday Cake', description: 'Vanilla sponge, strawberry jam and whipped vanilla buttercream. Order by 10 am.', category: 'food', tags: ['cake', 'birthday', 'dessert', 'celebration', 'gift'], variations: [['Serves 6 to 8', 3800, 'out_of_stock', 0]], taxable: false },
    ],
  },
  {
    slug: 'fern-and-field', name: 'Fern & Field Flowers', category: 'flowers', cover: 'cover_florist',
    description: 'Seasonal, loosely arranged bouquets using Ohio-grown stems whenever possible.',
    neighborhood: 'Madison Avenue', address: '16300 Madison Ave', lat: 41.4740, lng: -81.7905, phone: '(216) 555-0193',
    hours: wk('10:00', '18:00', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']), prepMinutes: 30,
    products: [
      { key: 'bouquet', name: 'Seasonal Flower Bouquet', description: "The florist's pick of this week's best stems, wrapped in kraft paper.", category: 'flowers', tags: ['bouquet', 'flowers', 'gift', 'anniversary', 'birthday', 'romantic', 'thank you'], variations: [['Petite', 3500, 'in_stock', 8], ['Classic', 5500, 'in_stock', 6], ['Grand', 8500, 'low_stock', 2]], modifiers: ['card'], featured: true },
      { key: 'roses', name: 'Dozen Red Roses', description: 'Twelve long-stem red roses with eucalyptus.', category: 'flowers', tags: ['roses', 'flowers', 'anniversary', 'romantic', 'valentine', 'gift'], variations: [['Dozen', 6800, 'in_stock', 5]], modifiers: ['card'] },
      { key: 'sunflowers', name: 'Sunflower Bundle', description: 'Five bright sunflowers, ready for a vase.', category: 'flowers', tags: ['sunflowers', 'flowers', 'cheerful', 'gift', 'get well'], variations: [['Five stems', 2800, 'in_stock', 10]], modifiers: ['card'], featured: true },
      { key: 'dried_flowers', name: 'Dried Flower Bunch', description: 'Bunny tails, lavender and wheat. Lasts for months.', category: 'flowers', tags: ['dried', 'flowers', 'decor', 'gift', 'lasting'], variations: [['Bunch', 3200, 'in_stock', 7]] },
      { key: 'bud_vase', name: 'Bud Vase Arrangement', description: 'A few delicate stems in a small glass vase you keep.', category: 'flowers', tags: ['vase', 'flowers', 'small gift', 'desk', 'thank you'], variations: [['Small', 2400, 'in_stock', 9]], modifiers: ['card'] },
      { key: 'peonies', name: 'Peony Bouquet', description: 'Lush garden peonies. Seasonal: back in late spring.', category: 'flowers', tags: ['peonies', 'flowers', 'seasonal'], variations: [['Bouquet', 7200, 'out_of_stock', 0]] },
    ],
  },
  {
    slug: 'corner-smash', name: 'Corner Smash', category: 'food', cover: 'cover_burger',
    description: 'Smash burgers, hand-cut fries and thick shakes. Counter service, made to order.',
    neighborhood: 'Madison Avenue', address: '17100 Madison Ave', lat: 41.4752, lng: -81.7940, phone: '(216) 555-0124',
    hours: wk('11:00', '21:00'), prepMinutes: 15,
    products: [
      { key: 'smash_burger', name: 'Smash Burger', description: 'Griddled beef, American cheese, house sauce and pickles on a potato bun.', category: 'food', tags: ['burger', 'lunch', 'dinner', 'beef'], variations: [['Single', 1300], ['Double', 1600]], modifiers: ['burger'], featured: true },
      { key: 'chicken_sandwich', name: 'Fried Chicken Sandwich', description: 'Buttermilk-brined thigh, slaw and hot honey.', category: 'food', tags: ['chicken', 'sandwich', 'lunch', 'dinner', 'spicy'], variations: [['Regular', 1400]] },
      { key: 'fries', name: 'Hand-Cut Fries', description: 'Twice fried, salted, with house sauce on the side.', category: 'food', tags: ['fries', 'side', 'lunch', 'dinner', 'vegetarian'], variations: [['Regular', 500], ['Large', 700]] },
      { key: 'grain_bowl', name: 'Garden Grain Bowl', description: 'Farro, roasted vegetables, greens, feta and lemon tahini.', category: 'food', tags: ['bowl', 'salad', 'vegetarian', 'healthy', 'lunch', 'dinner'], variations: [['Regular', 1500]] },
      { key: 'grilled_cheese', name: "Kids' Grilled Cheese", description: 'Cheddar on buttered white bread with a side of fries.', category: 'food', tags: ['kids', 'grilled cheese', 'lunch', 'dinner', 'vegetarian'], variations: [['Regular', 800]] },
      { key: 'milkshake', name: 'Black & White Shake', description: 'Vanilla custard spun with chocolate fudge.', category: 'food', tags: ['shake', 'dessert', 'sweet', 'drink'], variations: [['Regular', 700]] },
    ],
  },
  {
    slug: 'pantry-and-pear', name: 'Pantry & Pear Market', category: 'groceries', cover: 'cover_grocery',
    description: 'A neighborhood market for local produce, dairy, pantry staples and cheese.',
    neighborhood: 'West End', address: '20100 Detroit Ave', lat: 41.4795, lng: -81.8140, phone: '(216) 555-0158',
    hours: wk('08:00', '20:00'), prepMinutes: 20,
    products: [
      { key: 'honey', name: 'Local Raw Honey', description: 'Wildflower honey from hives in Cuyahoga County.', category: 'groceries', tags: ['honey', 'local', 'pantry', 'gift', 'sweet'], variations: [['16 oz jar', 1400, 'in_stock', 18]], taxable: false, featured: true },
      { key: 'eggs', name: 'Pasture-Raised Eggs', description: 'One dozen brown eggs from a family farm in Medina County.', category: 'groceries', tags: ['eggs', 'breakfast', 'dairy', 'farm'], variations: [['Dozen', 700, 'in_stock', 30]], taxable: false },
      { key: 'tomatoes', name: 'Heirloom Tomatoes', description: 'Mixed heirloom varieties, priced per pound.', category: 'groceries', tags: ['tomatoes', 'produce', 'vegetables', 'local'], variations: [['1 lb', 550, 'low_stock', 5]], taxable: false },
      { key: 'cheese_board', name: 'Cheese Board Kit', description: 'Three cheeses, crackers, fig jam and marcona almonds. Serves four.', category: 'groceries', tags: ['cheese', 'party', 'gift', 'entertaining', 'snack'], variations: [['Serves 4', 3200, 'in_stock', 6]], taxable: false, featured: true },
      { key: 'maple_syrup', name: 'Ohio Maple Syrup', description: 'Grade A amber syrup from Geauga County sugar bushes.', category: 'groceries', tags: ['maple', 'syrup', 'breakfast', 'pantry', 'gift', 'local'], variations: [['12 oz bottle', 1600, 'in_stock', 12]], taxable: false },
      { key: 'pasta', name: 'Fresh Egg Pasta', description: 'Hand-cut tagliatelle made in house. Cooks in three minutes.', category: 'groceries', tags: ['pasta', 'dinner', 'fresh'], variations: [['1 lb', 900, 'in_stock', 10]], taxable: false },
    ],
  },
  {
    slug: 'little-lake-goods', name: 'Little Lake Goods', category: 'gifts', cover: 'cover_gift',
    description: 'Gifts, cards and small-batch goods made by artists around the Great Lakes.',
    neighborhood: 'Downtown Lakewood', address: '14800 Detroit Ave', lat: 41.4815, lng: -81.7965, phone: '(216) 555-0187',
    hours: wk('11:00', '19:00'), prepMinutes: 15,
    products: [
      { key: 'greeting_cards', name: 'Letterpress Greeting Card', description: 'Printed by hand in Cleveland. Blank inside.', category: 'gifts', tags: ['card', 'greeting card', 'birthday', 'thank you', 'anniversary', 'stationery'], variations: [['Birthday', 600, 'in_stock', 40], ['Thank you', 600, 'in_stock', 32], ['Anniversary', 600, 'in_stock', 18]] },
      { key: 'mug', name: 'Handmade Ceramic Mug', description: 'Wheel-thrown stoneware in a speckled glaze. Holds 12 oz.', category: 'gifts', tags: ['mug', 'ceramic', 'handmade', 'gift', 'coffee lover'], variations: [['Speckled white', 3400, 'in_stock', 8], ['Lake blue', 3400, 'low_stock', 2]], featured: true },
      { key: 'map_print', name: 'Lake Erie Shoreline Print', description: '11 x 14 inch archival print of the Lakewood shoreline.', category: 'gifts', tags: ['print', 'art', 'map', 'local', 'gift', 'decor'], variations: [['Unframed', 4500, 'in_stock', 10]] },
      { key: 'candle_set', name: 'Soy Candle Gift Set', description: 'Three travel tins: cedar, citrus and fig.', category: 'gifts', tags: ['candle', 'gift set', 'gift', 'anniversary', 'birthday', 'self care'], variations: [['Set of 3', 3800, 'in_stock', 9]], featured: true },
      { key: 'science_kit', name: 'Crystal Growing Science Kit', description: 'Grow seven crystal specimens at home. Includes a guide to the chemistry. Ages 8 and up.', category: 'gifts', tags: ['kids', 'science', 'stem', 'experiment', 'birthday', 'gift', 'toy', 'age 8'], variations: [['Kit', 2800, 'in_stock', 6]], featured: true },
      { key: 'beanie', name: 'Hand-Knit Beanie', description: 'Merino wool, knit locally. One size.', category: 'gifts', tags: ['hat', 'beanie', 'winter', 'knit', 'gift'], variations: [['Oat', 2600, 'in_stock', 7], ['Charcoal', 2600, 'in_stock', 5]] },
    ],
  },
  {
    slug: 'rootbound-plant-studio', name: 'Rootbound Plant Studio', category: 'plants', cover: 'cover_plants',
    description: 'Healthy houseplants, honest care advice and planters for every windowsill.',
    neighborhood: 'Clifton Park', address: '11800 Clifton Blvd', lat: 41.4879, lng: -81.8216, phone: '(216) 555-0119',
    hours: wk('10:00', '18:00', ['wed', 'thu', 'fri', 'sat', 'sun']), prepMinutes: 15,
    products: [
      { key: 'monstera', name: 'Monstera Deliciosa', description: 'Split-leaf favorite. Bright indirect light, water when the top inch is dry.', category: 'plants', tags: ['monstera', 'houseplant', 'plant', 'tropical', 'gift'], variations: [['6 inch pot', 3800, 'in_stock', 7], ['10 inch pot', 7500, 'low_stock', 2]], taxable: true, featured: true },
      { key: 'snake_plant', name: 'Snake Plant', description: 'Nearly indestructible and great in low light.', category: 'plants', tags: ['snake plant', 'houseplant', 'plant', 'low light', 'easy care', 'gift'], variations: [['6 inch pot', 2900, 'in_stock', 11]] },
      { key: 'pothos', name: 'Golden Pothos Hanging Basket', description: 'Trailing vines in an 8 inch hanging pot.', category: 'plants', tags: ['pothos', 'houseplant', 'plant', 'hanging', 'easy care'], variations: [['8 inch basket', 2400, 'in_stock', 9]] },
      { key: 'fiddle_leaf', name: 'Fiddle Leaf Fig', description: 'A statement tree, about 3 feet tall.', category: 'plants', tags: ['fiddle leaf', 'tree', 'houseplant', 'plant', 'statement'], variations: [['3 ft', 6500, 'in_stock', 3]] },
      { key: 'succulents', name: 'Succulent Trio', description: 'Three small succulents in 3 inch nursery pots.', category: 'plants', tags: ['succulents', 'plant', 'small gift', 'desk', 'easy care'], variations: [['Set of 3', 1800, 'in_stock', 15]] },
      { key: 'planter', name: 'Matte Ceramic Planter', description: 'With drainage hole and saucer. Fits a 6 inch nursery pot.', category: 'plants', tags: ['planter', 'pot', 'ceramic', 'decor'], variations: [['6 inch', 2200, 'in_stock', 12]] },
    ],
  },
  {
    slug: 'ember-and-oak', name: 'Ember & Oak Home', category: 'home', cover: 'cover_home',
    description: 'Considered goods for the home: candles, linens, wood and stoneware.',
    neighborhood: 'Edgewater', address: '12200 Edgewater Dr', lat: 41.4893, lng: -81.7860, phone: '(216) 555-0165',
    hours: wk('10:00', '18:00', ['tue', 'wed', 'thu', 'fri', 'sat']), prepMinutes: 20,
    products: [
      { key: 'cedar_candle', name: 'Cedar Candle', description: 'Coconut soy wax, cedarwood and smoke. 60 hour burn.', category: 'home', tags: ['candle', 'cedar', 'home', 'gift', 'cozy'], variations: [['8 oz', 2800, 'in_stock', 14]], featured: true },
      { key: 'tea_towels', name: 'Linen Tea Towel Set', description: 'Two stonewashed linen towels in natural and charcoal.', category: 'home', tags: ['kitchen', 'linen', 'towel', 'home', 'gift'], variations: [['Set of 2', 2400, 'in_stock', 10]] },
      { key: 'cutting_board', name: 'Walnut Cutting Board', description: 'Made from Ohio black walnut. 12 x 18 inches.', category: 'home', tags: ['kitchen', 'wood', 'cutting board', 'gift', 'wedding', 'anniversary', 'handmade'], variations: [['12 x 18 in', 5800, 'in_stock', 4]] },
      { key: 'throw_blanket', name: 'Wool Throw Blanket', description: 'Soft lambswool in a herringbone weave. 50 x 60 inches.', category: 'home', tags: ['blanket', 'throw', 'cozy', 'home', 'gift'], variations: [['Natural', 12000, 'low_stock', 2]] },
      { key: 'bowls', name: 'Stoneware Bowl Set', description: 'Four hand-glazed bowls, dishwasher safe.', category: 'home', tags: ['bowls', 'kitchen', 'ceramic', 'dinnerware', 'home'], variations: [['Set of 4', 6400, 'in_stock', 5]] },
      { key: 'taper_holders', name: 'Taper Candle Holders', description: 'A pair of weighted holders with two unscented tapers.', category: 'home', tags: ['candle', 'holder', 'decor', 'home', 'gift'], variations: [['Pair', 3600, 'in_stock', 6]] },
    ],
  },
  {
    slug: 'shoreline-books', name: 'Shoreline Books', category: 'books', cover: 'cover_books',
    description: 'An independent bookshop with a big kids corner and staff picks on every shelf.',
    neighborhood: 'Downtown Lakewood', address: '15500 Detroit Ave', lat: 41.4826, lng: -81.8010, phone: '(216) 555-0133',
    hours: wk('10:00', '20:00'), prepMinutes: 15,
    products: [
      { key: 'kids_book', name: 'Kitchen Science for Curious Kids', description: '50 safe experiments with things you already have at home. Ages 7 to 11.', category: 'books', tags: ['kids', 'science', 'book', 'experiment', 'birthday', 'gift', 'age 8', 'stem'], variations: [['Paperback', 1800, 'in_stock', 5]], taxable: true, featured: true },
      { key: 'cookbook', name: 'Great Lakes Kitchen', description: 'Seasonal recipes from cooks around the Great Lakes. Hardcover.', category: 'books', tags: ['cookbook', 'book', 'cooking', 'gift', 'local'], variations: [['Hardcover', 3200, 'in_stock', 4]] },
      { key: 'puzzle', name: 'Lighthouse Jigsaw Puzzle', description: '1,000 pieces featuring a Lake Erie lighthouse at dusk.', category: 'books', tags: ['puzzle', 'game', 'gift', 'family', 'local'], variations: [['1,000 pieces', 2400, 'in_stock', 6]] },
    ],
  },
];
