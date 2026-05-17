const STORAGE_KEY = "kitchen-keeper-state-v1";
const STOP_WORDS = new Set([
  "fresh",
  "chopped",
  "diced",
  "minced",
  "sliced",
  "grated",
  "shredded",
  "large",
  "small",
  "medium",
  "optional",
  "to",
  "taste",
  "of",
  "and",
  "or",
  "the",
  "a",
  "an"
]);
const INGREDIENT_HEADINGS = ["ingredients", "ingredient"];
const DIRECTION_HEADINGS = ["directions", "instructions", "method", "preparation", "steps"];

const starterState = {
  recipes: [
    {
      id: makeId(),
      name: "Weeknight Tomato Pasta",
      url: "",
      image: "",
      ingredients: [
        "12 oz pasta",
        "1 jar tomato sauce",
        "2 cloves garlic",
        "1 tbsp olive oil",
        "parmesan cheese"
      ],
      directions: "Cook pasta. Warm olive oil with garlic, add sauce, then toss with pasta. Serve with parmesan.",
      createdAt: Date.now() - 20000
    }
  ],
  pantry: [
    pantryItemFromText("1 lb pasta"),
    pantryItemFromText("olive oil"),
    pantryItemFromText("eggs")
  ],
  grocery: [],
  selectedRecipeId: null
};

let state = loadState();
let toastTimer;

const els = {
  tabs: document.querySelectorAll(".nav-tab"),
  views: {
    recipes: document.getElementById("recipesView"),
    pantry: document.getElementById("pantryView"),
    grocery: document.getElementById("groceryView")
  },
  recipeCount: document.getElementById("recipeCount"),
  pantryCount: document.getElementById("pantryCount"),
  recipeList: document.getElementById("recipeList"),
  recipeListMeta: document.getElementById("recipeListMeta"),
  recipeDetail: document.getElementById("recipeDetail"),
  recipeSearch: document.getElementById("recipeSearch"),
  recipeFilter: document.getElementById("recipeFilter"),
  pantrySearch: document.getElementById("pantrySearch"),
  pantrySort: document.getElementById("pantrySort"),
  pantryList: document.getElementById("pantryList"),
  groceryRecipeSelect: document.getElementById("groceryRecipeSelect"),
  groceryList: document.getElementById("groceryList"),
  manualGroceryItem: document.getElementById("manualGroceryItem"),
  toast: document.getElementById("toast"),
  recipeDialog: document.getElementById("recipeDialog"),
  pantryDialog: document.getElementById("pantryDialog"),
  recipeForm: document.getElementById("recipeForm"),
  pantryForm: document.getElementById("pantryForm"),
  recipeImage: document.getElementById("recipeImage"),
  recipePreview: document.getElementById("recipePreview"),
  recipeScanStatus: document.getElementById("recipeScanStatus"),
  receiptImage: document.getElementById("receiptImage"),
  receiptPreview: document.getElementById("receiptPreview"),
  receiptScanStatus: document.getElementById("receiptScanStatus")
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return starterState;

  try {
    const parsed = JSON.parse(saved);
    return {
      recipes: Array.isArray(parsed.recipes) ? parsed.recipes : starterState.recipes,
      pantry: Array.isArray(parsed.pantry) ? parsed.pantry : starterState.pantry,
      grocery: Array.isArray(parsed.grocery) ? parsed.grocery : [],
      selectedRecipeId: parsed.selectedRecipeId || null
    };
  } catch {
    return starterState;
  }
}

function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  saveState();
  els.recipeCount.textContent = state.recipes.length;
  els.pantryCount.textContent = state.pantry.length;
  renderRecipes();
  renderPantry();
  renderGroceryRecipeOptions();
  renderGrocery();
}

function renderRecipes() {
  const query = els.recipeSearch.value.trim().toLowerCase();
  const filter = els.recipeFilter.value;
  const recipes = state.recipes.filter((recipe) => {
    const haystack = `${recipe.name} ${recipe.ingredients.join(" ")}`.toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const missing = getMissingIngredients(recipe).length;
    const matchesFilter =
      filter === "all" ||
      (filter === "ready" && missing === 0) ||
      (filter === "missing" && missing > 0);
    return matchesSearch && matchesFilter;
  });

  els.recipeListMeta.textContent = recipes.length === 1 ? "1 recipe" : `${recipes.length} recipes`;
  els.recipeList.innerHTML = "";

  if (!recipes.length) {
    els.recipeList.innerHTML = `<div class="empty-state"><h3>No matches</h3><p>Add a recipe or clear your filters.</p></div>`;
  }

  recipes.forEach((recipe) => {
    const missingCount = getMissingIngredients(recipe).length;
    const card = document.createElement("button");
    card.className = `recipe-card ${recipe.id === state.selectedRecipeId ? "active" : ""}`;
    card.type = "button";
    card.innerHTML = `
      <h4>${escapeHtml(recipe.name)}</h4>
      <span class="meta-line">${recipe.ingredients.length} ingredients</span>
      <span class="status-pill ${missingCount ? "warn" : ""}">
        ${missingCount ? `${missingCount} missing` : "Ready to cook"}
      </span>
    `;
    card.addEventListener("click", () => {
      state.selectedRecipeId = recipe.id;
      render();
    });
    els.recipeList.append(card);
  });

  renderRecipeDetail();
}

function renderRecipeDetail() {
  const recipe = state.recipes.find((item) => item.id === state.selectedRecipeId);
  if (!recipe) {
    els.recipeDetail.innerHTML = `
      <div class="empty-state">
        <h3>No recipe selected</h3>
        <p>Add a recipe or choose one from the list to compare it with your pantry.</p>
      </div>
    `;
    return;
  }

  const ingredients = recipe.ingredients.map((ingredient) => {
    const have = hasPantryMatch(ingredient);
    return `
      <div class="ingredient-row ${have ? "have" : "missing"}">
        <span>${escapeHtml(ingredient)}</span>
        <span>${have ? "In pantry" : "Missing"}</span>
      </div>
    `;
  });

  els.recipeDetail.innerHTML = `
    <div class="detail-top">
      <p class="eyebrow">Recipe Detail</p>
      <h3>${escapeHtml(recipe.name)}</h3>
      ${recipe.url ? `<a class="meta-line" href="${escapeAttribute(recipe.url)}" target="_blank" rel="noreferrer">${escapeHtml(recipe.url)}</a>` : ""}
      ${recipe.image ? `<img class="preview-image" src="${recipe.image}" alt="Saved recipe page" />` : ""}
    </div>
    <div class="detail-actions">
      <button class="primary-button" id="makeGroceryFromRecipe" type="button">Make Grocery List</button>
      <button class="secondary-button" id="useRecipeItems" type="button">Remove Used Pantry Items</button>
      <button class="danger-button" id="deleteRecipe" type="button">Delete Recipe</button>
    </div>
    <h3>Ingredients</h3>
    <div class="ingredient-list">${ingredients.join("")}</div>
    <h3>Directions</h3>
    <p class="directions">${escapeHtml(recipe.directions || "No directions saved yet.")}</p>
  `;

  document.getElementById("makeGroceryFromRecipe").addEventListener("click", () => {
    buildGroceryFromRecipe(recipe.id);
    switchView("grocery");
  });
  document.getElementById("useRecipeItems").addEventListener("click", () => {
    removeUsedPantryItems(recipe);
  });
  document.getElementById("deleteRecipe").addEventListener("click", () => {
    state.recipes = state.recipes.filter((item) => item.id !== recipe.id);
    state.selectedRecipeId = null;
    showToast("Recipe deleted.");
    render();
  });
}

function renderPantry() {
  const query = els.pantrySearch.value.trim().toLowerCase();
  const sorted = [...state.pantry].sort((a, b) => {
    if (els.pantrySort.value === "recent") return b.createdAt - a.createdAt;
    if (els.pantrySort.value === "category") return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  const items = sorted.filter((item) => {
    const haystack = `${item.name} ${item.amount} ${item.category}`.toLowerCase();
    return !query || haystack.includes(query);
  });

  els.pantryList.innerHTML = "";
  if (!items.length) {
    els.pantryList.innerHTML = `<div class="empty-state"><h3>No pantry items</h3><p>Add items manually or from a receipt.</p></div>`;
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "pantry-item";
    row.innerHTML = `
      <div class="pantry-info">
        <strong>${escapeHtml(titleCase(item.name))}</strong>
        <span class="meta-line">${escapeHtml(item.amount || "On hand")} - ${escapeHtml(item.category)}</span>
      </div>
      <div class="pantry-actions">
        <button class="small-button" data-action="minus" aria-label="Use one ${escapeAttribute(item.name)}">-</button>
        <button class="small-button" data-action="plus" aria-label="Add one ${escapeAttribute(item.name)}">+</button>
        <button class="danger-button" data-action="remove" type="button">Remove</button>
      </div>
    `;
    row.querySelector('[data-action="minus"]').addEventListener("click", () => adjustPantryQuantity(item.id, -1));
    row.querySelector('[data-action="plus"]').addEventListener("click", () => adjustPantryQuantity(item.id, 1));
    row.querySelector('[data-action="remove"]').addEventListener("click", () => removePantryItem(item.id));
    els.pantryList.append(row);
  });
}

function renderGroceryRecipeOptions() {
  els.groceryRecipeSelect.innerHTML = `<option value="">Choose a recipe...</option>`;
  state.recipes.forEach((recipe) => {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = recipe.name;
    option.selected = recipe.id === state.selectedRecipeId;
    els.groceryRecipeSelect.append(option);
  });
}

function renderGrocery() {
  els.groceryList.innerHTML = "";
  if (!state.grocery.length) {
    els.groceryList.innerHTML = `<div class="empty-state"><h3>Your grocery list is empty</h3><p>Build one from a recipe or add items manually.</p></div>`;
    return;
  }

  state.grocery.forEach((item) => {
    const row = document.createElement("div");
    row.className = "grocery-item";
    row.innerHTML = `
      <div class="grocery-info">
        <strong>${escapeHtml(item.text)}</strong>
        <span class="meta-line">${escapeHtml(item.source || "Manual item")}</span>
      </div>
      <button class="danger-button" type="button">Remove</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      state.grocery = state.grocery.filter((groceryItem) => groceryItem.id !== item.id);
      render();
    });
    els.groceryList.append(row);
  });
}

function pantryItemFromText(text) {
  const cleaned = cleanLine(text);
  const amount = extractAmount(cleaned);
  const name = normalizeIngredientName(cleaned);
  return {
    id: makeId(),
    raw: cleaned,
    name,
    key: keyForIngredient(name),
    amount,
    category: guessCategory(name),
    quantity: numericQuantity(cleaned),
    createdAt: Date.now()
  };
}

function addPantryLines(text) {
  const newItems = linesFromText(text).map(pantryItemFromText);
  newItems.forEach((newItem) => {
    const existing = state.pantry.find((item) => item.key === newItem.key);
    if (existing) {
      existing.quantity += newItem.quantity || 1;
      existing.amount = existing.quantity > 1 ? `${existing.quantity}` : existing.amount || newItem.amount;
      existing.createdAt = Date.now();
    } else {
      state.pantry.push(newItem);
    }
  });
  showToast(`${newItems.length} pantry ${newItems.length === 1 ? "item" : "items"} added.`);
  render();
}

function buildGroceryFromRecipe(recipeId) {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe) return;
  const missing = getMissingIngredients(recipe);
  state.selectedRecipeId = recipe.id;
  state.grocery = missing.map((ingredient) => ({
    id: makeId(),
    text: ingredient,
    source: recipe.name
  }));
  showToast(missing.length ? "Grocery list created." : "You have everything for this recipe.");
  render();
}

function getMissingIngredients(recipe) {
  return recipe.ingredients.filter((ingredient) => !hasPantryMatch(ingredient));
}

function hasPantryMatch(ingredient) {
  const key = keyForIngredient(normalizeIngredientName(ingredient));
  return state.pantry.some((item) => item.key === key || key.includes(item.key) || item.key.includes(key));
}

function removeUsedPantryItems(recipe) {
  const recipeKeys = recipe.ingredients.map((ingredient) => keyForIngredient(normalizeIngredientName(ingredient)));
  let removed = 0;
  state.pantry = state.pantry.filter((item) => {
    const used = recipeKeys.some((key) => item.key === key || key.includes(item.key) || item.key.includes(key));
    if (used) removed += 1;
    return !used;
  });
  showToast(removed ? `${removed} pantry items removed.` : "No matching pantry items to remove.");
  render();
}

function adjustPantryQuantity(id, amount) {
  const item = state.pantry.find((pantryItem) => pantryItem.id === id);
  if (!item) return;
  item.quantity = Math.max(0, (item.quantity || 1) + amount);
  item.amount = item.quantity > 0 ? `${item.quantity}` : item.amount;
  if (item.quantity === 0) removePantryItem(id);
  render();
}

function removePantryItem(id) {
  state.pantry = state.pantry.filter((item) => item.id !== id);
  render();
}

function normalizeIngredientName(text) {
  const withoutParens = text.replace(/\([^)]*\)/g, " ");
  const withoutLeadingAmount = withoutParens
    .replace(/^\s*(\d+([./]\d+)?|\d+\s+\d+\/\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*/i, "")
    .replace(/^\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|grams?|g|kg|ml|liters?|cans?|jars?|cloves?|slices?|packages?|bags?|boxes?|gallons?|quarts?|pints?)\s+/i, "");
  const beforeComma = withoutLeadingAmount.split(",")[0];
  const words = beforeComma
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word));
  return singularize(words.slice(-3).join(" ") || beforeComma.trim().toLowerCase());
}

function keyForIngredient(text) {
  return singularize(text.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

function singularize(text) {
  return text
    .replace(/\bies\b/g, "y")
    .replace(/\b(\w{4,})es\b/g, "$1")
    .replace(/\b(\w{4,})s\b/g, "$1");
}

function extractAmount(text) {
  const match = text.match(/^\s*([\d./\s]+)?\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|grams?|g|kg|ml|liters?|cans?|jars?|cloves?|slices?|packages?|bags?|boxes?|gallons?|quarts?|pints?)\b/i);
  return match ? match[0].trim() : "";
}

function numericQuantity(text) {
  const match = text.match(/^\s*(\d+)/);
  return match ? Number(match[1]) : 1;
}

function guessCategory(name) {
  const lower = name.toLowerCase();
  if (/(milk|cheese|yogurt|butter|cream|egg)/.test(lower)) return "Dairy";
  if (/(chicken|beef|pork|turkey|fish|salmon|shrimp|bacon)/.test(lower)) return "Meat";
  if (/(apple|banana|lettuce|tomato|onion|garlic|carrot|potato|pepper|berry|spinach)/.test(lower)) return "Produce";
  if (/(flour|sugar|rice|pasta|bean|sauce|oil|vinegar|cereal|bread|can|jar)/.test(lower)) return "Pantry";
  if (/(salt|pepper|cumin|paprika|oregano|basil|spice|seasoning)/.test(lower)) return "Spices";
  return "Other";
}

function linesFromText(text) {
  return text.split(/\r?\n/).map(cleanLine).filter(Boolean);
}

function cleanLine(line) {
  return line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/\s+/g, " ").trim();
}

function titleCase(text) {
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(text) {
  return escapeHtml(text).replaceAll("`", "&#096;");
}

function switchView(view) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  Object.entries(els.views).forEach(([name, section]) => section.classList.toggle("active", name === view));
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function setStatus(element, message) {
  element.textContent = message;
}

async function readImageText(input, statusElement) {
  const file = input.files?.[0];
  if (!file) {
    showToast("Choose a photo first.");
    return "";
  }

  if (!window.Tesseract) {
    showToast("Photo reading needs internet access to load OCR.");
    return "";
  }

  setStatus(statusElement, "Preparing photo...");
  const preparedImage = await prepareImageForOcr(file);
  setStatus(statusElement, "Reading photo...");
  const result = await window.Tesseract.recognize(preparedImage, "eng", {
    logger: (event) => {
      if (event.status === "recognizing text") {
        setStatus(statusElement, `Reading photo... ${Math.round(event.progress * 100)}%`);
      }
    },
    tessedit_pageseg_mode: window.Tesseract.PSM?.AUTO || "3",
    tessedit_ocr_engine_mode: window.Tesseract.OEM?.LSTM_ONLY || "1",
    preserve_interword_spaces: "1"
  });
  setStatus(statusElement, "Photo read. Review the extracted text before saving.");
  return normalizeOcrText(result.data.text);
}

async function prepareImageForOcr(file) {
  const imageUrl = await fileToDataUrl(file);
  const image = await loadImage(imageUrl);
  const scale = image.width < 1600 ? 2 : 1.35;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const threshold = averageLuminance(data) * 0.92;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
    const contrasted = luminance < threshold ? 0 : 255;
    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function averageLuminance(data) {
  let total = 0;
  let pixels = 0;
  for (let index = 0; index < data.length; index += 4) {
    total += data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    pixels += 1;
  }
  return total / pixels;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the selected image."));
    image.src = src;
  });
}

function normalizeOcrText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/[|]/g, "I")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function importRecipeFromLink() {
  const urlInput = document.getElementById("recipeUrl");
  const url = urlInput.value.trim();
  if (!url) {
    showToast("Paste a recipe link first.");
    return;
  }

  const button = document.getElementById("importRecipeLink");
  button.disabled = true;
  setStatus(els.recipeScanStatus, "Reading recipe link...");

  try {
    const html = await fetchRecipePage(url);
    const recipe = parseRecipePage(html, url);
    fillRecipeForm(recipe);
    setStatus(els.recipeScanStatus, "Recipe imported. Review it, then save.");
  } catch (error) {
    setStatus(els.recipeScanStatus, "");
    showToast(error.message || "Could not read that recipe link.");
  } finally {
    button.disabled = false;
  }
}

async function fetchRecipePage(url) {
  const attempts = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt);
      if (response.ok) return response.text();
    } catch {
      // Try the next route. Some recipe sites block direct browser requests.
    }
  }

  throw new Error("That site blocked the recipe import. Try a different link or use a photo.");
}

function parseRecipePage(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const structured = findStructuredRecipe(doc);
  if (structured) return { ...structured, url: structured.url || url };

  const text = doc.body?.innerText || html;
  const parsed = extractRecipeFromText(text);
  parsed.url = url;
  return parsed;
}

function findStructuredRecipe(doc) {
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent.trim());
      const recipe = findRecipeObject(parsed);
      if (!recipe) continue;
      return {
        name: recipe.name || "",
        url: recipe.url || "",
        ingredients: arrayText(recipe.recipeIngredient),
        directions: instructionText(recipe.recipeInstructions).join("\n\n"),
        image: Array.isArray(recipe.image) ? recipe.image[0] || "" : recipe.image || ""
      };
    } catch {
      // Ignore malformed metadata and continue with text extraction.
    }
  }
  return null;
}

function findRecipeObject(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeObject(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const type = value["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return value;
  return findRecipeObject(value["@graph"]);
}

function arrayText(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((item) => {
      if (typeof item === "string") return item;
      if (item.text) return item.text;
      if (item.name) return item.name;
      if (Array.isArray(item.itemListElement)) return arrayText(item.itemListElement).join("\n");
      return "";
    })
    .flatMap((item) => String(item).split(/\r?\n/))
    .map(cleanLine)
    .filter(Boolean);
}

function instructionText(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .flatMap((item) => {
      if (typeof item === "string") return cleanLine(item);
      if (!item || typeof item !== "object") return [];

      if (Array.isArray(item.itemListElement)) {
        const childSteps = instructionText(item.itemListElement);
        return item.name ? `${cleanLine(item.name)}\n${childSteps.join("\n")}` : childSteps;
      }

      if (item.text) return cleanLine(item.text);
      if (item.name) return cleanLine(item.name);
      return [];
    })
    .filter(Boolean);
}

function extractRecipeFromText(text) {
  const lines = cleanupRecipeLines(linesFromText(text));
  const name = lines.find((line) => !isRecipeHeading(line) && line.length > 3) || "Imported Recipe";
  const ingredients = extractSection(lines, INGREDIENT_HEADINGS, DIRECTION_HEADINGS).filter(isLikelyIngredient);
  const directions = extractSection(lines, DIRECTION_HEADINGS, INGREDIENT_HEADINGS).join("\n");

  return {
    name,
    url: "",
    image: "",
    ingredients: ingredients.length ? ingredients : lines.filter(isLikelyIngredient).slice(0, 20),
    directions
  };
}

function cleanupRecipeLines(lines) {
  return lines
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/^(save|print|share|advertisement|jump to recipe)$/i.test(line))
    .filter((line) => !/^https?:/i.test(line))
    .filter((line) => !/^\d+\s*(ratings?|reviews?)$/i.test(line));
}

function extractSection(lines, startHeadings, stopHeadings) {
  const start = lines.findIndex((line) => startHeadings.some((heading) => line.toLowerCase().includes(heading)));
  if (start === -1) return [];
  const results = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const lower = line.toLowerCase();
    if (stopHeadings.some((heading) => lower.includes(heading))) break;
    if (!isRecipeHeading(line)) results.push(line);
  }
  return results;
}

function fillRecipeForm(recipe) {
  if (recipe.name) document.getElementById("recipeName").value = recipe.name;
  if (recipe.url) document.getElementById("recipeUrl").value = recipe.url;
  if (recipe.ingredients?.length) document.getElementById("recipeIngredients").value = recipe.ingredients.join("\n");
  if (recipe.directions) document.getElementById("recipeDirections").value = recipe.directions;
}

function isRecipeHeading(line) {
  const lower = line.toLowerCase().replace(/:/g, "").trim();
  return [...INGREDIENT_HEADINGS, ...DIRECTION_HEADINGS, "notes", "nutrition"].includes(lower);
}

function isLikelyIngredient(line) {
  const lower = line.toLowerCase();
  if (line.length < 3 || line.length > 90) return false;
  if (/subtotal|total|visa|mastercard|cash|change|tax|coupon|thank you|www\.|http/.test(lower)) return false;
  return /(\d|cup|tbsp|tsp|ounce|oz|pound|lb|can|jar|clove|salt|pepper|oil|flour|sugar|egg|milk|cheese|butter)/i.test(line);
}

function extractReceiptItems(text) {
  return cleanupReceiptLines(linesFromText(text)).filter((line) => {
    const lower = line.toLowerCase();
    if (line.length < 3 || line.length > 60) return false;
    if (/\b(total|subtotal|tax|visa|mastercard|debit|credit|cash|change|balance|auth|approval|receipt|store|phone|thank|coupon|savings)\b/.test(lower)) return false;
    if (/^\d{2,}[-\s]?\d{2,}/.test(line)) return false;
    if (/^\$?\d+([.,]\d{2})?$/.test(line)) return false;
    return /[a-z]/i.test(line);
  });
}

function cleanupReceiptLines(lines) {
  return lines
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .map((line) => line.replace(/\s+\$?\d+[.,]\d{2}\s*$/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^[-_=]+$/.test(line))
    .filter((line) => !/^\*+$/.test(line))
    .filter((line) => !/^\d+$/.test(line));
}

function wireEvents() {
  els.tabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  document.getElementById("openRecipeForm").addEventListener("click", () => els.recipeDialog.showModal());
  document.getElementById("openPantryForm").addEventListener("click", () => els.pantryDialog.showModal());
  document.getElementById("closeRecipeDialog").addEventListener("click", () => els.recipeDialog.close());
  document.getElementById("cancelRecipeDialog").addEventListener("click", () => els.recipeDialog.close());
  document.getElementById("closePantryDialog").addEventListener("click", () => els.pantryDialog.close());
  document.getElementById("cancelPantryDialog").addEventListener("click", () => els.pantryDialog.close());
  document.getElementById("importRecipeLink").addEventListener("click", importRecipeFromLink);
  document.getElementById("readRecipeImage").addEventListener("click", async () => {
    const button = document.getElementById("readRecipeImage");
    button.disabled = true;
    try {
      const text = await readImageText(els.recipeImage, els.recipeScanStatus);
      if (!text) return;
      fillRecipeForm(extractRecipeFromText(text));
    } catch {
      setStatus(els.recipeScanStatus, "");
      showToast("Could not read that recipe photo.");
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("readReceiptImage").addEventListener("click", async () => {
    const button = document.getElementById("readReceiptImage");
    button.disabled = true;
    try {
      const text = await readImageText(els.receiptImage, els.receiptScanStatus);
      const items = extractReceiptItems(text);
      if (!items.length) {
        showToast("No receipt items found. Try a clearer photo.");
        return;
      }
      document.getElementById("receiptText").value = items.join("\n");
      addPantryLines(items.join("\n"));
      setStatus(els.receiptScanStatus, "Receipt read and pantry updated.");
    } catch {
      setStatus(els.receiptScanStatus, "");
      showToast("Could not read that receipt photo.");
    } finally {
      button.disabled = false;
    }
  });
  els.recipeSearch.addEventListener("input", render);
  els.recipeFilter.addEventListener("change", render);
  els.pantrySearch.addEventListener("input", render);
  els.pantrySort.addEventListener("change", render);

  els.recipeForm.addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const recipe = {
      id: makeId(),
      name: document.getElementById("recipeName").value.trim(),
      url: document.getElementById("recipeUrl").value.trim(),
      image: els.recipePreview.src && !els.recipePreview.classList.contains("hidden") ? els.recipePreview.src : "",
      ingredients: linesFromText(document.getElementById("recipeIngredients").value),
      directions: document.getElementById("recipeDirections").value.trim(),
      createdAt: Date.now()
    };
    state.recipes.unshift(recipe);
    state.selectedRecipeId = recipe.id;
    els.recipeForm.reset();
    els.recipePreview.classList.add("hidden");
    els.recipeDialog.close();
    showToast("Recipe saved.");
    render();
  });

  els.pantryForm.addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    addPantryLines(document.getElementById("pantryBulkItems").value);
    els.pantryForm.reset();
    els.pantryDialog.close();
  });

  document.getElementById("addReceiptItems").addEventListener("click", () => {
    const receiptText = document.getElementById("receiptText");
    if (!receiptText.value.trim()) {
      showToast("Type the receipt items first.");
      return;
    }
    addPantryLines(receiptText.value);
    receiptText.value = "";
  });

  els.groceryRecipeSelect.addEventListener("change", (event) => buildGroceryFromRecipe(event.target.value));
  document.getElementById("addManualGroceryItem").addEventListener("click", () => {
    const text = els.manualGroceryItem.value.trim();
    if (!text) return;
    state.grocery.push({ id: makeId(), text, source: "Manual item" });
    els.manualGroceryItem.value = "";
    render();
  });
  document.getElementById("copyGroceryList").addEventListener("click", copyGroceryList);

  previewImage(els.recipeImage, els.recipePreview);
  previewImage(els.receiptImage, els.receiptPreview);
}

function previewImage(input, image) {
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      image.src = reader.result;
      image.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });
}

async function copyGroceryList() {
  const text = state.grocery.map((item) => `- ${item.text}`).join("\n");
  if (!text) {
    showToast("Grocery list is empty.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast("Grocery list copied.");
  } catch {
    showToast("Select and copy is not available in this browser.");
  }
}

if (!state.selectedRecipeId && state.recipes.length) {
  state.selectedRecipeId = state.recipes[0].id;
}

wireEvents();
render();
