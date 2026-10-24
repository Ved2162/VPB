export const HERO_VIDEO = "https://videos.pexels.com/video-files/35740269/15149323_3840_2160_30fps.mp4";
export const HERO_POSTER = "https://images.pexels.com/videos/35740269/ahmedabad-uttarayan-colorful-kites-festival-editing-festival-of-joy-35740269.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200";
export const HERO_VIDEO_2 = "https://videos.pexels.com/video-files/35740287/15149426_3840_2160_30fps.mp4";

export const INSTAGRAM_HANDLE = "@verai_patang_bhandar";
export const INSTAGRAM_URL = "https://www.instagram.com/verai_patang_bhandar";

export const PHONE = "9081111697";
export const PHONE_DISPLAY = "+91 90811 11697";
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
  { src: "/images/craft/craft-01.webp", label: "Hand-finished Reels" },
  { src: "/images/workshop/workshop-05.webp", label: "Karigar at Work" },
  { src: "/images/craft/craft-02.webp", label: "Manjha Paste Coating" },
  { src: "/images/workshop/workshop-04.webp", label: "Workshop Reels" },
  { src: "/images/craft/craft-03.webp", label: "Cotton Preparation" },
  { src: "/images/workshop/workshop-06.webp", label: "Thread Finishing" },
];

// Original customer-supplied workshop photos; web assets only change encoding.
export const WORKSHOP_IMAGES = Array.from({ length: 7 }, (_, i) =>
  `/images/workshop/workshop-${String(i + 1).padStart(2, "0")}.webp`
);

export const HOMEPAGE_CRAFT_IMAGES = [
  "/images/craft/craft-01.webp",
  "/images/craft/craft-02.webp",
  "/images/craft/craft-03.webp",
];
