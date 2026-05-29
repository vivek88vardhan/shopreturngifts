export type GiftMomentSlide = {
  id: string;
  name: string;
  role: string;
  quote: string;
  quoteLocal?: string;
  localeLabel?: string;
  image: string;
  accent: string;
};

const theme = (file: string) => `/assets/shopreturngifts/themes/${file}.png`;

/** Kids’ favorite themes — themed return-gift bundles (inspired party favor collections). */
export const giftMomentSlides: GiftMomentSlide[] = [
  {
    id: 'hot-wheels',
    name: 'Hot Wheels',
    role: 'Racing & speed lovers',
    quote: 'Mini cars, tracks, and high-energy favors kids race home with — perfect for car-themed birthdays.',
    localeLabel: 'Racing theme',
    image: theme('theme-hot-wheels'),
    accent: 'from-orange-500 to-red-600',
  },
  {
    id: 'demon-slayer',
    name: 'Demon Slayer',
    role: 'Anime action fans',
    quote: 'Bold, collectible-style party packs for kids who love epic anime adventures.',
    localeLabel: 'Anime theme',
    image: theme('theme-demon-slayer'),
    accent: 'from-emerald-600 to-teal-700',
  },
  {
    id: 'mario',
    name: 'Super Mario',
    role: 'Classic game heroes',
    quote: 'Jump-into-fun return gifts with coins, stars, and playful adventure vibes.',
    localeLabel: 'Adventure theme',
    image: theme('theme-mario'),
    accent: 'from-red-500 to-blue-600',
  },
  {
    id: 'cars',
    name: 'Cars',
    role: 'Lightning-speed parties',
    quote: 'Race-day favor bags that feel straight from the track — kids love the energy.',
    localeLabel: 'Cars theme',
    image: theme('theme-cars'),
    accent: 'from-red-600 to-amber-500',
  },
  {
    id: 'star-wars',
    name: 'Star Wars',
    role: 'Galaxy explorers',
    quote: 'Space saga-inspired bundles for young Jedi and starship fans at your party.',
    localeLabel: 'Space theme',
    image: theme('theme-starwars'),
    accent: 'from-slate-700 to-indigo-900',
  },
  {
    id: 'toy-story',
    name: 'Toy Story',
    role: 'Cowboy & space buddies',
    quote: 'Friendship-themed favors that feel like a toy chest come to life.',
    localeLabel: 'Toy Story theme',
    image: theme('theme-toystory'),
    accent: 'from-sky-500 to-cyan-600',
  },
  {
    id: 'dog-man',
    name: 'Dog Man',
    role: 'Comic book laughs',
    quote: 'Silly hero favors for readers who want funny, action-packed goodie bags.',
    localeLabel: 'Dog Man theme',
    image: theme('theme-dogman'),
    accent: 'from-blue-600 to-amber-400',
  },
  {
    id: 'httyd',
    name: 'How to Train Your Dragon',
    role: 'Dragon riders',
    quote: 'Viking-and-dragon themed packs that spark imagination at every seat.',
    localeLabel: 'Dragon theme',
    image: theme('theme-dragon'),
    accent: 'from-teal-600 to-emerald-700',
  },
  {
    id: 'bad-guys',
    name: 'The Bad Guys',
    role: 'Heist crew fun',
    quote: 'Cool, mischievous favor bundles for kids who love the reformed crooks crew.',
    localeLabel: 'Bad Guys theme',
    image: theme('theme-bad-guys'),
    accent: 'from-slate-600 to-lime-500',
  },
  {
    id: 'minecraft',
    name: 'Minecraft',
    role: 'Block builders',
    quote: 'Pixel-perfect party favors with building and adventure energy kids recognize instantly.',
    localeLabel: 'Minecraft theme',
    image: theme('theme-minecraft'),
    accent: 'from-lime-600 to-green-800',
  },
  {
    id: 'spongebob',
    name: 'SpongeBob',
    role: 'Undersea giggles',
    quote: 'Bright, bubbly return gifts for pineapple-under-the-sea party themes.',
    localeLabel: 'SpongeBob theme',
    image: theme('theme-spongebob'),
    accent: 'from-yellow-400 to-cyan-500',
  },
  {
    id: 'peppa-pig',
    name: 'Peppa Pig',
    role: 'Preschool favorites',
    quote: 'Sweet, family-friendly favor bags perfect for little ones and nursery parties.',
    localeLabel: 'Peppa theme',
    image: theme('theme-peppa'),
    accent: 'from-pink-400 to-rose-400',
  },
  {
    id: 'masha-bear',
    name: 'Masha and the Bear',
    role: 'Forest friends',
    quote: 'Cozy woodland-themed bundles for playful preschool celebrations.',
    localeLabel: 'Masha theme',
    image: theme('theme-masha'),
    accent: 'from-rose-400 to-amber-500',
  },
  {
    id: 'blippi',
    name: 'Blippi',
    role: 'Learn & play',
    quote: 'Colorful, educational-style favors that parents trust and kids get excited about.',
    localeLabel: 'Blippi theme',
    image: theme('theme-blippi'),
    accent: 'from-orange-400 to-blue-500',
  },
];
