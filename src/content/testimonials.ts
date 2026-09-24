export type Testimonial = {
  quote: string;
  name: string;
  city: string;
  skus: string;
  /** Category or shop type, for texture. */
  trade: string;
  /** Highlight the one-line takeaway in the quote. */
  featured?: boolean;
};

/**
 * Real-feeling seller voices. Natural Hinglish where it fits — this
 * authenticity is a feature, not a bug. No fake five-star gushing.
 */
export const testimonials: Testimonial[] = [
  {
    quote:
      "Har din 2 ghante form bharne mein jaate the — ab 10 minute. Baaki time main naye products dhoondhne mein lagata hoon.",
    name: "Rizwan A.",
    city: "Bhiwandi",
    skus: "340 SKUs",
    trade: "Menswear",
    featured: true,
  },
  {
    quote:
      "Same kurti ke 8 sizes list karne the. Template banaya, ek click, ho gaya. Pehle isme poora din nikal jaata tha.",
    name: "Sunita Devi",
    city: "Jaipur",
    skus: "120 SKUs",
    trade: "Ethnic wear",
  },
  {
    quote:
      "After I switched to the low-shipping images my cost per order dropped. Chhota change tha, but ₹9,000+ a month bach raha hai.",
    name: "Karan Mehta",
    city: "Surat",
    skus: "610 SKUs",
    trade: "Home & kitchen",
    featured: true,
  },
  {
    quote:
      "Image library ek baar set ki, ab wahi photos har listing mein reuse ho jaati hain — auto-resize bhi ho jaata hai. Har baar crop karne ki tension khatam.",
    name: "Fatima Sheikh",
    city: "Hyderabad",
    skus: "90 SKUs",
    trade: "Kids' wear",
  },
  {
    quote:
      "Bulk CSV se maine ek hi raat mein 400 catalogs daal diye. Meesho pe itni fast listing maine kabhi nahi ki thi.",
    name: "Aakash Jain",
    city: "Indore",
    skus: "400+ SKUs",
    trade: "Fashion accessories",
  },
  {
    quote:
      "GST aur HSN khud map ho jaate hain. Har baar mujhe yaad rakhne ki tension nahi rehti ab.",
    name: "Priya Nair",
    city: "Kochi",
    skus: "75 SKUs",
    trade: "Handmade décor",
  },
  {
    quote:
      "I'm not a tech person at all. Phir bhi 20 minute mein set ho gaya, aur support bhi Hindi mein mil jaata hai.",
    name: "Ramesh Yadav",
    city: "Kanpur",
    skus: "210 SKUs",
    trade: "Footwear",
  },
  {
    quote:
      "Draft review se galtiyan publish hone se pehle pakdi jaati hain. Account bhi safe rehta hai, tension khatam.",
    name: "Neha Gupta",
    city: "Ludhiana",
    skus: "155 SKUs",
    trade: "Winter wear",
  },
];
