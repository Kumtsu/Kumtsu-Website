const legacyCategories=[
  {
    "id": "all",
    "label": "ทั้งหมด"
  },
  {
    "id": "signature",
    "label": "ข้าวพ่นไฟ"
  },
  {
    "id": "yakiniku",
    "label": "ยากินิกุ"
  },
  {
    "id": "onigiri",
    "label": "โอนิกิริ"
  },
  {
    "id": "mala",
    "label": "หม่าล่าไฟลุก"
  },
  {
    "id": "korean",
    "label": "อันยองคุ้มสึ"
  },
  {
    "id": "thai",
    "label": "คุ้มสึสวัสดี"
  },
  {
    "id": "noodle",
    "label": "เด็กเส้น"
  },
  {
    "id": "side-dish",
    "label": "กับข้าว"
  },
  {
    "id": "karaage",
    "label": "คาราเกะ ด้ง"
  },
  {
    "id": "topping",
    "label": "เครื่องเคียง"
  },
  {
    "id": "appetizer",
    "label": "ของทานเล่น"
  },
  {
    "id": "drink",
    "label": "เครื่องดื่ม"
  }
];
const legacyMenu=[
  {
    "id": "SG0001",
    "category": "signature",
    "name": "ข้าวหน้าหมูสันคอพ่นไฟ",
    "en": "FlameTorched Pork Shoulder Rice Bowl M",
    "price": 119,
    "image": "assets/menu/SG0001.jpg"
  },
  {
    "id": "SG0004",
    "category": "signature",
    "name": "ข้าวหน้าหมูสามชั้นพ่นไฟ",
    "en": "FlameTorched Pork Belly Rice Bowl M",
    "price": 129,
    "image": "assets/menu/SG0004.jpg"
  },
  {
    "id": "SG0002",
    "category": "signature",
    "name": "ข้าวหน้าเนื้อออสเตรเลียพ่นไฟ",
    "en": "FlameTorched Australian Beef Rice Bowl M",
    "price": 139,
    "image": "assets/menu/SG0002.jpg"
  },
  {
    "id": "SG0008",
    "category": "signature",
    "name": "ข้าวหน้าเนื้อแฮมเบิร์กพ่นไฟ",
    "en": "",
    "price": 169,
    "image": "assets/menu/SG0008.jpg"
  },
  {
    "id": "CH0001",
    "category": "mala",
    "name": "ข้าวหน้าสันคอหมูหม่าล่าไฟลุก",
    "en": "FlameTorched Pork Shoulder Rice with MALA Sauce Rice Bowl M",
    "price": 129,
    "image": "assets/menu/CH0001.jpg"
  },
  {
    "id": "CH0002",
    "category": "mala",
    "name": "ข้าวหน้าหมูสามชั้นหม่าล่าไฟลุก",
    "en": "FlameTorched Pork Belly Rice with MALA Sauce Rice Bowl M",
    "price": 139,
    "image": "assets/menu/CH0002.jpg"
  },
  {
    "id": "CH0003",
    "category": "mala",
    "name": "ข้าวหน้าเนื้อออสเตรเลียหม่าล่าไฟลุก",
    "en": "FlameTorched Australian Beef with MALA Sauce Rice Bowl M",
    "price": 149,
    "image": "assets/menu/CH0003.jpg"
  },
  {
    "id": "CH0007",
    "category": "mala",
    "name": "ข้าวหน้าหมูย่างซอสหม่าล่า",
    "en": "",
    "price": 119,
    "image": "assets/menu/CH0007.jpg"
  },
  {
    "id": "CH0008",
    "category": "mala",
    "name": "ข้าวหน้าไก่ย่างซอสหม่าล่า",
    "en": "",
    "price": 119,
    "image": "assets/menu/CH0008.jpg"
  },
  {
    "id": "KR0006",
    "category": "korean",
    "name": "ข้าวหน้าหมูสันคอผัดกิมจิ",
    "en": "",
    "price": 125,
    "image": "assets/menu/KR0006.jpg"
  },
  {
    "id": "KR0003",
    "category": "korean",
    "name": "ข้าวหน้าหมูสันคอผัดซอสโคชูจัง",
    "en": "Stir-Fried Pork Shoulder with Gochujang Sauce Rice Bowl",
    "price": 125,
    "image": "assets/menu/KR0003.jpg"
  },
  {
    "id": "KR0002",
    "category": "korean",
    "name": "ข้าวหน้าหมูสามชั้นผัดกิมจิ",
    "en": "Stir-Fried Pork Belly and Kimchi Rice Bowl",
    "price": 135,
    "image": "assets/menu/KR0002.jpg"
  },
  {
    "id": "KR0004",
    "category": "korean",
    "name": "ข้าวหน้าหมูสามชั้นผัดซอสโคชูจัง",
    "en": "Stir-Fried Pork Belly with Gochujang Sauce Rice Bowl",
    "price": 135,
    "image": "assets/menu/KR0004.jpg"
  },
  {
    "id": "KR0001",
    "category": "korean",
    "name": "ข้าวหน้าเนื้อออสเตรเลียผัดกิมจิ",
    "en": "",
    "price": 155,
    "image": "assets/menu/KR0001.jpg"
  },
  {
    "id": "KR0005",
    "category": "korean",
    "name": "ข้าวหน้าเนื้อออสเตรเลียผัดซอสโคชูจัง",
    "en": "",
    "price": 155,
    "image": "assets/menu/KR0005.jpg"
  },
  {
    "id": "TH0003",
    "category": "thai",
    "name": "ข้าวกะเพราหมูสันคอพ่นไฟ",
    "en": "FlameTorched Pork Belly Rice with MALA Sauce Rice Bowl M",
    "price": 119,
    "image": "assets/menu/TH0003.jpg"
  },
  {
    "id": "TH0004",
    "category": "thai",
    "name": "ข้าวกะเพราหมูสามชั้นพ่นไฟ",
    "en": "FlameTorched Pork Belly Rice with MALA Sauce Rice Bowl XL",
    "price": 129,
    "image": "assets/menu/TH0004.jpg"
  },
  {
    "id": "TH0001",
    "category": "thai",
    "name": "ข้าวกะเพราเนื้อออสเตรเลียพ่นไฟ",
    "en": "FlameTorched Pork Shoulder Rice with MALA Sauce Rice Bowl M",
    "price": 139,
    "image": "assets/menu/TH0001.jpg"
  },
  {
    "id": "TH0010",
    "category": "thai",
    "name": "ข้าวหน้าหมูย่างยำแซ่บ",
    "en": "",
    "price": 129,
    "image": "assets/menu/TH0010.jpg"
  },
  {
    "id": "TH0011",
    "category": "thai",
    "name": "ข้าวหน้าไก่ย่างยำแซ่บ",
    "en": "",
    "price": 129,
    "image": "assets/menu/TH0011.jpg"
  },
  {
    "id": "ND0001",
    "category": "noodle",
    "name": "หมี่หม่าล่าหมูสันคอไฟลุก",
    "en": "",
    "price": 149,
    "image": "assets/menu/ND0001.jpg"
  },
  {
    "id": "ND0002",
    "category": "noodle",
    "name": "หมี่หม่าล่าหมูสามชั้นไฟลุก",
    "en": "",
    "price": 159,
    "image": "assets/menu/ND0002.jpg"
  },
  {
    "id": "ND0003",
    "category": "noodle",
    "name": "หมี่หม่าล่าเนื้อออสเตรเลียไฟลุก",
    "en": "",
    "price": 159,
    "image": "assets/menu/ND0003.jpg"
  },
  {
    "id": "YK0002",
    "category": "yakiniku",
    "name": "ชุดยากินิกุหมูสันคอ",
    "en": "",
    "price": 219,
    "image": "assets/menu/YK0002.jpg"
  },
  {
    "id": "YK0003",
    "category": "yakiniku",
    "name": "ชุดยากินิกุหมูสามชั้น",
    "en": "",
    "price": 229,
    "image": "assets/menu/YK0003.jpg"
  },
  {
    "id": "YK0001",
    "category": "yakiniku",
    "name": "ชุดยากินิกุเนื้อออสเตรเลีย",
    "en": "",
    "price": 249,
    "image": "assets/menu/YK0001.jpg"
  },
  {
    "id": "SD0002",
    "category": "side-dish",
    "name": "สันคอหมูพ่นไฟ กับข้าว",
    "en": "",
    "price": 189,
    "image": "assets/menu/SD0002.jpg"
  },
  {
    "id": "SD0001",
    "category": "side-dish",
    "name": "เนื้อออสเตรเลียพ่นไฟ กับข้าว",
    "en": "",
    "price": 199,
    "image": "assets/menu/SD0001.jpg"
  },
  {
    "id": "KA0001",
    "category": "karaage",
    "name": "ข้าวหน้าไก่คาราเกะ ซอส ญี่ปุ่น (เสิร์ฟคู่กิมจิ)",
    "en": "",
    "price": 119,
    "image": "assets/menu/KA0001.jpg"
  },
  {
    "id": "KA0002",
    "category": "karaage",
    "name": "ข้าวหน้าไก่คาราเกะ ซอส หม่าล่า (เสิร์ฟคู่กิมจิ)",
    "en": "",
    "price": 119,
    "image": "assets/menu/KA0002.jpg"
  },
  {
    "id": "KA0003",
    "category": "karaage",
    "name": "ข้าวหน้าไก่คาราเกะ ซอส น้ำปลา (เสิร์ฟคู่กิมจิ)",
    "en": "",
    "price": 119,
    "image": "assets/menu/KA0003.jpg"
  },
  {
    "id": "ONI0001",
    "category": "onigiri",
    "name": "โอนิกิริ กุ้ง พ่นไฟ おにぎり",
    "en": "",
    "price": 89,
    "image": "assets/menu/ONI0001.jpg"
  },
  {
    "id": "ONI0002",
    "category": "onigiri",
    "name": "โอนิกิริ สันคอหมู พ่นไฟ おにぎり",
    "en": "",
    "price": 89,
    "image": "assets/menu/ONI0002.jpg"
  },
  {
    "id": "ONI0003",
    "category": "onigiri",
    "name": "โอนิกิริ หมูสามชั้น พ่นไฟ おにぎり",
    "en": "",
    "price": 89,
    "image": "assets/menu/ONI0003.jpg"
  },
  {
    "id": "ONI0004",
    "category": "onigiri",
    "name": "โอนิกิริ เนื้อออสเตรเลีย พ่นไฟ おにぎり",
    "en": "",
    "price": 99,
    "image": "assets/menu/ONI0004.jpg"
  },
  {
    "id": "TP0002",
    "category": "topping",
    "name": "ไข่ออนเซ็น",
    "en": "Onzen Egg",
    "price": 20,
    "image": "assets/menu/TP0002.jpg"
  },
  {
    "id": "TP0003",
    "category": "topping",
    "name": "ไข่ดองซีอิ๊ว",
    "en": "Soy Sauce Pickled Egg",
    "price": 30,
    "image": "assets/menu/TP0003.jpg"
  },
  {
    "id": "TP0004",
    "category": "topping",
    "name": "ซุปมิโซะ",
    "en": "Miso Soup",
    "price": 20,
    "image": "assets/menu/TP0004.jpg"
  },
  {
    "id": "TP0005",
    "category": "topping",
    "name": "กิมจิ",
    "en": "Kimchi",
    "price": 39,
    "image": "assets/menu/TP0005.jpg"
  },
  {
    "id": "TP0006",
    "category": "topping",
    "name": "ข้าวญี่ปุ่น",
    "en": "Steamed Japanese Rice",
    "price": 25,
    "image": "assets/menu/TP0006.jpg"
  },
  {
    "id": "TP0007",
    "category": "topping",
    "name": "ต้นหอมซอย",
    "en": "Sliced Spring Onion",
    "price": 10,
    "image": "assets/menu/TP0007.jpg"
  },
  {
    "id": "TP0008",
    "category": "topping",
    "name": "พริกซอย",
    "en": "Sliced Chilli",
    "price": 10,
    "image": "assets/menu/TP0008.jpg"
  },
  {
    "id": "TP0010",
    "category": "topping",
    "name": "ข้าวผัดเนยกระเทียม",
    "en": "",
    "price": 25,
    "image": "assets/menu/TP0010.jpg"
  },
  {
    "id": "TP0011",
    "category": "topping",
    "name": "เนื้อแฮมเบิร์ก 1 ชิ้น",
    "en": "",
    "price": 79,
    "image": "assets/menu/TP0011.jpg"
  },
  {
    "id": "KZ0001",
    "category": "appetizer",
    "name": "เกี้ยวซ่าหมู KINZA GYOZA (ทอดน้ำ) 3 ชิ้น",
    "en": "",
    "price": 59,
    "image": "assets/menu/KZ0001.jpg"
  },
  {
    "id": "KZ0002",
    "category": "appetizer",
    "name": "เกี้ยวซ่าหมู KINZA GYOZA (ทอดน้ำ) 5 ชิ้น",
    "en": "",
    "price": 99,
    "image": "assets/menu/KZ0002.jpg"
  },
  {
    "id": "AP0001",
    "category": "appetizer",
    "name": "ไก่คาราเกะ ซอส หม่าล่า",
    "en": "",
    "price": 109,
    "image": "assets/menu/AP0001.jpg"
  },
  {
    "id": "AP0002",
    "category": "appetizer",
    "name": "ไก่คาราเกะ ซอส ทรัฟเฟิลมาโย",
    "en": "",
    "price": 109,
    "image": "assets/menu/AP0002.jpg"
  },
  {
    "id": "BV0001",
    "category": "drink",
    "name": "น้ำดื่มมิเนเร่",
    "en": "",
    "price": 25,
    "image": "assets/menu/BV0001.jpg"
  },
  {
    "id": "BV0002",
    "category": "drink",
    "name": "เป๊ปซี่ 345 ml.",
    "en": "",
    "price": 30,
    "image": "assets/menu/BV0002.jpg"
  }
];
const brands=window.KUMTSU_CATALOG?.brands||[];
const state={brand:"kumtsu",category:"all",query:"",cart:{},checkout:false,method:"delivery",lastOrderText:""};
let categories=[];
let menu=[];
const $=s=>document.querySelector(s);
const grid=$("#menuGrid"),tabs=$("#categoryTabs"),brandTabs=$("#brandTabs"),drawer=$("#cartDrawer"),overlay=$("#overlay");
const money=n=>`฿${n.toLocaleString("th-TH")}`;

function activeBrand(){return brands.find(brand=>brand.id===state.brand)||brands[0]}
function syncBrand(){
  const brand=activeBrand();
  menu=brand?.items||[];
  categories=[{id:"all",label:"ทั้งหมด"},...(brand?.categories||[])];
  $("#menuBrandTitle").textContent=`เมนู${brand?.name||""}`;
  $("#successTitle").textContent=`ขอบคุณที่สั่ง${brand?.short||brand?.name||"อาหาร"}`;
}
function renderBrands(){
  brandTabs.innerHTML=brands.map(brand=>`<button type="button" class="brand-tab ${brand.id===state.brand?"active":""}" data-brand="${brand.id}" style="--brand-accent:${brand.accent}">${brand.logo?`<img src="${brand.logo}" alt="">`:`<span>${brand.monogram||brand.short.charAt(0)}</span>`}<strong>${brand.short}</strong></button>`).join("");
}
function renderTabs(){tabs.innerHTML=categories.map(c=>`<button type="button" class="${c.id===state.category?"active":""}" data-category="${c.id}">${c.label}</button>`).join("")}
function renderMenu(){
  const q=state.query.trim().toLowerCase();
  const categoryOrder=new Map(categories.map((category,index)=>[category.id,index]));
  const items=menu.filter(m=>(state.category==="all"||m.category===state.category)&&(!q||`${m.name} ${m.en} ${m.id}`.toLowerCase().includes(q))).sort((a,b)=>categoryOrder.get(a.category)-categoryOrder.get(b.category));
  grid.innerHTML=items.map(m=>`<article class="menu-card"><div class="menu-photo"><img src="${m.image}" alt="${m.name}" loading="lazy" decoding="async"></div><div class="menu-card-content"><div class="card-top"><span class="menu-code">${m.id}</span>${/พ่นไฟ|หม่าล่า/.test(`${m.name} ${categories.find(c=>c.id===m.category)?.label||""}`)?'<span class="flame-badge">🔥 พ่นไฟ</span>':""}</div><h3>${m.name}</h3>${m.en?`<p class="en">${m.en}</p>`:""}<div class="card-bottom"><span class="price">${money(m.price)}</span><button class="add-button" type="button" data-add="${m.key}">+ เพิ่ม</button></div></div></article>`).join("");
  $("#emptyState").hidden=items.length>0;
}
function cartItems(){return Object.entries(state.cart).map(([key,qty])=>({item:menu.find(m=>m.key===key),qty})).filter(x=>x.item)}
function renderCart(){
  const items=cartItems(),count=items.reduce((s,x)=>s+x.qty,0),total=items.reduce((s,x)=>s+x.item.price*x.qty,0);
  $("#cartCount").textContent=count;$("#mobileCartCount").textContent=count;$("#mobileCartTotal").textContent=money(total);$("#mobileCart").hidden=!count;
  $("#cartEmpty").hidden=!!count;$("#cartFooter").hidden=!count;
  $("#cartList").innerHTML=items.map(({item,qty})=>`<div class="cart-item"><div><h4>${item.name}</h4><p>${money(item.price)} / รายการ</p><div class="qty-control"><button type="button" data-dec="${item.key}" aria-label="ลดจำนวน ${item.name}">−</button><strong>${qty}</strong><button type="button" data-inc="${item.key}" aria-label="เพิ่มจำนวน ${item.name}">+</button></div></div><span class="cart-item-price">${money(item.price*qty)}</span></div>`).join("");
  $("#subtotal").textContent=money(total);
  $("#checkoutForm").hidden=!state.checkout;$("#checkoutButton").textContent=state.checkout?"ยืนยันคำสั่งซื้อ":`ดำเนินการต่อ · ${money(total)}`;
}
function add(key){state.cart[key]=(state.cart[key]||0)+1;renderCart();const btn=document.querySelector(`[data-add="${key}"]`);if(btn){btn.textContent="✓ เพิ่มแล้ว";btn.classList.add("added");setTimeout(()=>{btn.textContent="+ เพิ่ม";btn.classList.remove("added")},650)}}
function openCart(){drawer.classList.add("open");drawer.setAttribute("aria-hidden","false");overlay.hidden=false;document.body.style.overflow="hidden";setTimeout(()=>$("#closeCart").focus(),50)}
function closeCart(){drawer.classList.remove("open");drawer.setAttribute("aria-hidden","true");overlay.hidden=true;document.body.style.overflow=""}
function validateAndOrder(){
  const fields=[$("#customerName"),$("#customerPhone")];if(state.method==="delivery")fields.push($("#customerAddress"));
  let valid=true;fields.forEach(f=>{const ok=f.value.trim().length>0;f.classList.toggle("invalid",!ok);if(!ok)valid=false});
  if(!valid){fields.find(f=>f.classList.contains("invalid"))?.focus();return}
  const orderNo=`KM${Math.floor(1000+Math.random()*9000)}`,items=cartItems(),total=items.reduce((s,x)=>s+x.item.price*x.qty,0);
  state.lastOrderText=[`ออเดอร์ ${orderNo}`,`แบรนด์: ${activeBrand().name}`,`ชื่อ: ${$("#customerName").value.trim()}`,`โทร: ${$("#customerPhone").value.trim()}`,state.method==="delivery"?`จัดส่ง: ${$("#customerAddress").value.trim()}`:"รับอาหารที่ร้าน",...items.map(x=>`- ${x.item.name} x${x.qty} = ${money(x.item.price*x.qty)}`),`รวมค่าอาหาร ${money(total)}`,$("#orderNote").value.trim()?`หมายเหตุ: ${$("#orderNote").value.trim()}`:""].filter(Boolean).join("\n");
  $("#orderNumber").textContent=orderNo;closeCart();$("#successDialog").showModal();state.cart={};state.checkout=false;renderCart();
}
tabs.addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(!b)return;state.category=b.dataset.category;renderTabs();renderMenu()});
brandTabs.addEventListener("click",e=>{
  const button=e.target.closest("[data-brand]");if(!button||button.dataset.brand===state.brand)return;
  if(cartItems().length&&!window.confirm("เปลี่ยนแบรนด์แล้วตะกร้าปัจจุบันจะถูกล้าง ต้องการเปลี่ยนหรือไม่?"))return;
  state.brand=button.dataset.brand;state.category="all";state.query="";state.cart={};
  $("#searchInput").value="";$("#headerSearch").value="";
  syncBrand();renderBrands();renderTabs();renderMenu();renderCart();
});
grid.addEventListener("click",e=>{const b=e.target.closest("[data-add]");if(b&&!b.disabled)add(b.dataset.add)});
$("#searchInput").addEventListener("input",e=>{state.query=e.target.value;renderMenu()});
function searchFromHeader(){state.query=$("#headerSearch").value;$("#searchInput").value=state.query;state.category="all";renderTabs();renderMenu();$("#menu").scrollIntoView({behavior:"smooth"})}
$("#headerSearchButton").addEventListener("click",searchFromHeader);$("#headerSearch").addEventListener("keydown",e=>{if(e.key==="Enter")searchFromHeader()});
document.querySelectorAll("[data-promo-category]").forEach(link=>link.addEventListener("click",()=>{state.brand="kumtsu";syncBrand();renderBrands();state.category=link.dataset.promoCategory;state.query="";$("#searchInput").value="";renderTabs();renderMenu()}));
[$("#openCart"),$("#mobileCart")].forEach(b=>b.addEventListener("click",openCart));$("#closeCart").addEventListener("click",closeCart);overlay.addEventListener("click",closeCart);
$("#cartList").addEventListener("click",e=>{const inc=e.target.closest("[data-inc]"),dec=e.target.closest("[data-dec]");if(inc)state.cart[inc.dataset.inc]++;if(dec){state.cart[dec.dataset.dec]--;if(state.cart[dec.dataset.dec]<=0)delete state.cart[dec.dataset.dec]}renderCart()});
$("#checkoutButton").addEventListener("click",()=>{if(!state.checkout){state.checkout=true;renderCart();setTimeout(()=>$("#customerName").focus(),50)}else validateAndOrder()});
document.querySelectorAll("[data-method]").forEach(b=>b.addEventListener("click",()=>{state.method=b.dataset.method;document.querySelectorAll("[data-method]").forEach(x=>x.classList.toggle("active",x===b));$("#addressField").hidden=state.method==="pickup"}));
$("#copyOrderButton").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(state.lastOrderText);$("#copyOrderButton").textContent="✓ คัดลอกแล้ว"}catch{$("#copyOrderButton").textContent="กดค้างเพื่อคัดลอก"}});
[$("#closeSuccess"),$("#doneButton")].forEach(b=>b.addEventListener("click",()=>$("#successDialog").close()));
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&drawer.classList.contains("open"))closeCart()});
syncBrand();renderBrands();renderTabs();renderMenu();renderCart();

function registerWebMCP(){
  const context=document.modelContext;if(!context?.registerTool)return;
  try{
    void Promise.resolve(context.registerTool({
      name:"add_menu_items_to_cart",
      title:"เพิ่มเมนูลงตะกร้าคุ้มสึ",
      description:"เพิ่มเมนูร้านคุ้มสึหนึ่งรายการหรือหลายรายการลงในตะกร้าที่แสดงอยู่ โดยใช้รหัสเมนูและจำนวน",
      inputSchema:{type:"object",properties:{items:{type:"array",minItems:1,items:{type:"object",properties:{menuId:{type:"string"},quantity:{type:"integer",minimum:1,maximum:20}},required:["menuId","quantity"],additionalProperties:false}}},required:["items"],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input){
        if(!input||!Array.isArray(input.items)||!input.items.length)throw new Error("ต้องระบุรายการอาหารอย่างน้อย 1 รายการ");
        const normalized=input.items.map(entry=>{const item=menu.find(m=>m.id===entry?.menuId);if(!item||item.price===null)throw new Error(`ไม่พบเมนูที่เปิดขายในแบรนด์ ${activeBrand().name}: ${entry?.menuId||"ไม่ระบุ"}`);if(!Number.isInteger(entry.quantity)||entry.quantity<1||entry.quantity>20)throw new Error("จำนวนต้องเป็นเลข 1–20");return{item,quantity:entry.quantity}});
        normalized.forEach(({item,quantity})=>{state.cart[item.key]=(state.cart[item.key]||0)+quantity});renderCart();openCart();
        return{status:"added",items:normalized.map(x=>({menuId:x.item.id,name:x.item.name,quantity:x.quantity})),cartTotal:cartItems().reduce((sum,x)=>sum+x.item.price*x.qty,0)};
      }
    })).catch(()=>{});
  }catch{}
}
registerWebMCP();
