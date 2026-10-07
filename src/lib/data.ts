export const HERO_VIDEO = "https://videos.pexels.com/video-files/35740269/15149323_3840_2160_30fps.mp4";
export const HERO_POSTER = "https://images.pexels.com/videos/35740269/ahmedabad-uttarayan-colorful-kites-festival-editing-festival-of-joy-35740269.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200";
export const HERO_VIDEO_2 = "https://videos.pexels.com/video-files/35740287/15149426_3840_2160_30fps.mp4";

export const INSTAGRAM_HANDLE = "@verai_patang_bhandar";
export const INSTAGRAM_URL = "https://www.instagram.com/verai_patang_bhandar";

export const PHONE = "9727328905";
export const PHONE_DISPLAY = "+91 97273 28905";
export const WHATSAPP_URL = `https://wa.me/91${PHONE}`;

export const ADDRESS = "Verai Patang Bhandar, Cluster Nikol 4 Swagat Park 1(1-36), Nicol Gam, Nikol, Ahmedabad, Gujarat 380049";
export const ADDRESS_MAPS_URL = "https://maps.google.com/?q=Verai+Patang+Bhandar,+Cluster+Nikol+4+Swagat+Park+1,+Nicol+Gam,+Nikol,+Ahmedabad,+Gujarat+380049";

export const money = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

export const ORDER_STEPS = ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];
export const ORDER_LABEL: Record<string, string> = {
  placed: "Order Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const CRAFT_IMAGES = [
  "https://images.pexels.com/photos/4440344/pexels-photo-4440344.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/12672112/pexels-photo-12672112.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/15049300/pexels-photo-15049300.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
];

export const GALLERY = [
  { src: "https://images.pexels.com/photos/30333344/pexels-photo-30333344.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", label: "Uttarayan 2025" },
  { src: "https://images.pexels.com/photos/15049300/pexels-photo-15049300.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", label: "9 Cord — Adnan Special" },
  { src: "https://images.pexels.com/photos/15470478/pexels-photo-15470478.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", label: "Manjha Spools" },
  { src: "https://images.pexels.com/photos/5005214/pexels-photo-5005214.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", label: "Patang Collection" },
  { src: "https://images.pexels.com/photos/4440344/pexels-photo-4440344.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", label: "Karigar Hands" },
  { src: "https://images.pexels.com/photos/30470265/pexels-photo-30470265.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", label: "Sankranti Sky" },
];
