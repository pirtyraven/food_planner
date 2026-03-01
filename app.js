const STORAGE_KEY = "meal-planner-v3";
const MAX_WEEK_MEALS = 4;
const NEVER_USED_AGE_BONUS = 200;
const AGE_WEIGHT_POWER = 1.8;
const SUPABASE_URL = "https://fpjxossedqvcetgoppwg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwanhvc3NlZHF2Y2V0Z29wcHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTMxNDEsImV4cCI6MjA4Nzg2OTE0MX0.Y6lAJeuXgkWBSVXd5OXBp3LYOFsMYso9J4H4pk_2MvI";
const FAMILY_PLAN_ID = "per-familj";
const REMOTE_TABLE = "family_plans";
const REMOTE_POLL_MS = 15000;
const REMOTE_SAVE_DEBOUNCE_MS = 600;

const defaultMealDefinitions = [
  { name: "Spaghetti bolognese", ingredients: ["spaghetti", "nötfärs", "tomatkross", "gul lök", "vitlök"] },
  { name: "Kyckling i ugn", ingredients: ["kycklingfilé", "potatis", "morot", "olja", "timjan"] },
  { name: "Tacokväll", ingredients: ["nötfärs", "tortillabröd", "sallad", "tomat", "majs", "riven ost"] },
  { name: "Lax med ris", ingredients: ["laxfilé", "ris", "citron", "broccoli"] },
  { name: "Korv stroganoff", ingredients: ["falukorv", "matlagningsgrädde", "tomatpuré", "gul lök", "ris"] },
  { name: "Köttbullar med potatis", ingredients: ["köttbullar", "potatis", "gräddsås", "lingonsylt", "gurka"] },
  { name: "Pannkakor", ingredients: ["vetemjöl", "mjölk", "ägg", "smör", "sylt"] },
  { name: "Chili con carne", ingredients: ["nötfärs", "kidneybönor", "krossade tomater", "gul lök", "ris"] },
  { name: "Fiskgratäng", ingredients: ["torsk", "potatis", "matlagningsgrädde", "dill", "citron"] },
  { name: "Lasagne", ingredients: ["lasagneplattor", "nötfärs", "krossade tomater", "ost", "béchamelsås"] },
  { name: "Tomatsoppa", ingredients: ["krossade tomater", "gul lök", "vitlök", "grädde", "bröd"] },
  { name: "Kycklingwok", ingredients: ["kycklingfilé", "wokgrönsaker", "nudlar", "soja", "ingefära"] },
  { name: "Torsk med äggsås", ingredients: ["torsk", "potatis", "ägg", "mjölk", "smör"] },
  { name: "Pasta pesto", ingredients: ["pasta", "pesto", "kycklingfilé", "cocktailtomater", "parmesan"] },
  { name: "Vegetarisk curry", ingredients: ["kikärtor", "kokosmjölk", "paprika", "spenat", "curry"] },
  { name: "Hamburgare", ingredients: ["hamburgerbröd", "hamburgare", "sallad", "tomat", "ost"] },
  { name: "Köttfärssås med makaroner", ingredients: ["makaroner", "nötfärs", "krossade tomater", "gul lök", "oregano"] },
  { name: "Ugnspannkaka", ingredients: ["vetemjöl", "mjölk", "ägg", "bacon", "lingonsylt"] },
  { name: "Minestronesoppa", ingredients: ["morot", "selleri", "krossade tomater", "vita bönor", "pasta"] },
  { name: "Kyckling tacos", ingredients: ["kycklingfilé", "tortillabröd", "paprika", "sallad", "creme fraiche"] }
];

const defaultMeals = defaultMealDefinitions.map((meal) => ({
  id: crypto.randomUUID(),
  name: meal.name,
  ingredients: meal.ingredients
}));

const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
let remoteSaveTimer = null;
let lastRemoteUpdatedAt = null;
let isApplyingRemoteState = false;
let remotePollTimer = null;
let openAddSlotIndex = null;

const state = loadState();

const weekPicker = document.getElementById("weekPicker");
const applyRotationBtn = document.getElementById("applyRotation");
const randomizeWeekMenuBtn = document.getElementById("randomizeWeekMenu");
const rotationStatus = document.getElementById("rotationStatus");
const mealForm = document.getElementById("mealForm");
const mealName = document.getElementById("mealName");
const mealIngredients = document.getElementById("mealIngredients");
const mealList = document.getElementById("mealList");
const selectedList = document.getElementById("selectedList");
const ingredientForm = document.getElementById("ingredientForm");
const ingredientName = document.getElementById("ingredientName");
const resetIngredientsBtn = document.getElementById("resetIngredients");
const shoppingList = document.getElementById("shoppingList");
const selectedCount = document.getElementById("selectedCount");
const clearWeekBtn = document.getElementById("clearWeek");
const ingredientsDialog = document.getElementById("ingredientsDialog");
const ingredientsDialogTitle = document.getElementById("ingredientsDialogTitle");
const ingredientsDialogContent = document.getElementById("ingredientsDialogContent");
const closeIngredientsDialogBtn = document.getElementById("closeIngredientsDialog");

init();

function init() {
  weekPicker.value = state.activeWeek || currentWeekString();
  if (!state.activeWeek) {
    state.activeWeek = weekPicker.value;
  }

  ensureWeek(state.activeWeek);
  Object.values(state.weeks).forEach((week) => normalizeWeekData(week));

  registerEvents();
  render();
  startRemoteSync();
}

function registerEvents() {
  weekPicker.addEventListener("change", () => {
    state.activeWeek = weekPicker.value;
    ensureWeek(state.activeWeek);
    saveState();
    render();
  });

  applyRotationBtn.addEventListener("click", () => {
    resetWeekToDefaultRotation(state.activeWeek);
  });

  randomizeWeekMenuBtn.addEventListener("click", () => {
    randomizeWeekMenu(state.activeWeek);
  });

  mealForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = mealName.value.trim();
    const ingredients = mealIngredients.value
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);

    if (!name || ingredients.length === 0) {
      return;
    }

    state.meals.push({
      id: crypto.randomUUID(),
      name,
      ingredients
    });

    mealName.value = "";
    mealIngredients.value = "";
    saveState();
    render();
  });

  clearWeekBtn.addEventListener("click", () => {
    ensureWeek(state.activeWeek);
    state.weeks[state.activeWeek].mealIds = [];
    saveState();
    render();
  });

  ingredientForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addCustomIngredient(ingredientName.value);
    ingredientName.value = "";
  });

  resetIngredientsBtn.addEventListener("click", () => {
    resetIngredientsForWeek(state.activeWeek);
  });

  closeIngredientsDialogBtn.addEventListener("click", () => {
    if (typeof ingredientsDialog.close === "function") {
      ingredientsDialog.close();
    }
  });
}

function render() {
  ensureWeek(state.activeWeek);
  renderRotationStatus();
  renderMeals();
  renderSelectedMeals();
  renderShoppingList();
  selectedCount.textContent = `${state.weeks[state.activeWeek].mealIds.length} / ${MAX_WEEK_MEALS} valda`;
}

function renderRotationStatus() {
  rotationStatus.textContent = `Standard för ${state.activeWeek}: slumpad med vikt mot rätter som inte valts på länge.`;
}

function renderMeals() {
  mealList.innerHTML = "";
  const week = state.weeks[state.activeWeek];

  state.meals.forEach((meal) => {
    const li = document.createElement("li");

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = meal.name;

    const ingredientsLink = document.createElement("button");
    ingredientsLink.type = "button";
    ingredientsLink.className = "ingredients-link";
    ingredientsLink.textContent = "ingredienser";
    ingredientsLink.addEventListener("click", () => {
      openIngredientsPopup(meal);
    });

    info.append(title, document.createElement("br"), ingredientsLink);

    const actions = document.createElement("div");
    actions.className = "meal-actions";

    const checkboxLabel = document.createElement("label");
    checkboxLabel.className = "meal-checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = week.mealIds.includes(meal.id);
    checkbox.addEventListener("change", () => {
      const ok = setMealSelection(meal.id, checkbox.checked);
      if (!ok) {
        checkbox.checked = false;
      }
    });

    const checkboxText = document.createElement("span");
    checkboxText.textContent = "Välj";

    checkboxLabel.append(checkbox, checkboxText);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger mini";
    deleteBtn.textContent = "Radera";
    deleteBtn.addEventListener("click", () => deleteMeal(meal.id));

    actions.append(checkboxLabel, deleteBtn);
    li.append(info, actions);
    mealList.appendChild(li);
  });
}

function openIngredientsPopup(meal) {
  ingredientsDialogTitle.textContent = `Ingredienser: ${meal.name}`;
  ingredientsDialogContent.textContent = meal.ingredients.join(", ");

  if (typeof ingredientsDialog.showModal === "function") {
    ingredientsDialog.showModal();
    return;
  }

  alert(`${meal.name}\n\n${meal.ingredients.join(", ")}`);
}

function renderSelectedMeals() {
  selectedList.innerHTML = "";
  const mealIds = state.weeks[state.activeWeek].mealIds;
  const availableMeals = state.meals.filter((meal) => !mealIds.includes(meal.id));

  if (mealIds.length === 0 && availableMeals.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Inga maträtter finns ännu. Lägg till en rätt först.";
    selectedList.appendChild(li);
    return;
  }

  mealIds.forEach((id, index) => {
    const meal = state.meals.find((m) => m.id === id);
    if (!meal) return;
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = `${index + 1}. ${meal.name}`;

    const actions = document.createElement("div");
    actions.className = "meal-actions";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-danger mini";
    removeBtn.textContent = "X";
    removeBtn.title = "Ta bort från veckan";
    removeBtn.addEventListener("click", () => {
      openAddSlotIndex = null;
      setMealSelection(meal.id, false);
    });

    actions.append(removeBtn);
    li.append(name, actions);
    selectedList.appendChild(li);
  });

  const slotsLeft = MAX_WEEK_MEALS - mealIds.length;
  for (let i = 0; i < slotsLeft; i += 1) {
    const slotIndex = mealIds.length + i;
    const li = document.createElement("li");
    li.className = "add-slot-item";

    if (openAddSlotIndex === slotIndex) {
      const select = document.createElement("select");
      select.className = "slot-select";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Välj rätt";
      select.appendChild(placeholder);

      availableMeals.forEach((meal) => {
        const option = document.createElement("option");
        option.value = meal.id;
        option.textContent = meal.name;
        select.appendChild(option);
      });

      const actions = document.createElement("div");
      actions.className = "meal-actions";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn mini";
      addBtn.textContent = "Lägg till";
      addBtn.addEventListener("click", () => {
        if (!select.value) {
          return;
        }
        openAddSlotIndex = null;
        setMealSelection(select.value, true);
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-secondary mini";
      cancelBtn.textContent = "Avbryt";
      cancelBtn.addEventListener("click", () => {
        openAddSlotIndex = null;
        renderSelectedMeals();
      });

      actions.append(addBtn, cancelBtn);
      li.append(select, actions);
    } else {
      const plusBtn = document.createElement("button");
      plusBtn.type = "button";
      plusBtn.className = "btn btn-secondary mini add-slot-btn";
      plusBtn.textContent = "+ Lägg till rätt";
      plusBtn.addEventListener("click", () => {
        openAddSlotIndex = slotIndex;
        renderSelectedMeals();
      });

      li.append(plusBtn);
    }

    selectedList.appendChild(li);
  }
}

function renderShoppingList() {
  shoppingList.innerHTML = "";
  const week = state.weeks[state.activeWeek];
  const ingredientCounts = getEffectiveIngredientCountsForWeek(state.activeWeek);

  if (ingredientCounts.size === 0) {
    const li = document.createElement("li");
    li.textContent = "Inga ingredienser ännu.";
    shoppingList.appendChild(li);
    return;
  }

  [...ingredientCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "sv"))
    .forEach(([ingredient, count]) => {
      const li = document.createElement("li");
      li.className = week.checkedIngredients.includes(ingredient) ? "ingredient-checked" : "";

      const nameWrap = document.createElement("label");
      nameWrap.className = "ingredient-check";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = week.checkedIngredients.includes(ingredient);
      check.addEventListener("change", () => {
        setIngredientCheckedForWeek(ingredient, check.checked);
      });

      const name = document.createElement("span");
      name.textContent = ingredient;
      nameWrap.append(check, name);

      const actions = document.createElement("div");
      actions.className = "meal-actions";

      const amount = document.createElement("strong");
      amount.textContent = count > 1 ? `${count}x` : "";

      const removeBtn = document.createElement("button");
      removeBtn.className = "btn btn-danger mini";
      removeBtn.textContent = "Ta bort";
      removeBtn.addEventListener("click", () => removeIngredientForWeek(ingredient));

      actions.append(amount, removeBtn);
      li.append(nameWrap, actions);
      shoppingList.appendChild(li);
    });
}

function setMealSelection(mealId, shouldBeSelected) {
  ensureWeek(state.activeWeek);
  const week = state.weeks[state.activeWeek];
  const i = week.mealIds.indexOf(mealId);

  if (shouldBeSelected) {
    if (i >= 0) {
      return true;
    }

    if (week.mealIds.length >= MAX_WEEK_MEALS) {
      alert("Max 4 rätter per vecka.");
      return false;
    }

    week.mealIds.push(mealId);
  } else if (i >= 0) {
    week.mealIds.splice(i, 1);
  }

  saveState();
  render();
  return true;
}

function deleteMeal(mealId) {
  const meal = state.meals.find((item) => item.id === mealId);
  if (!meal) {
    return;
  }

  const confirmed = window.confirm(`Är du säker på att du vill ta bort "${meal.name}"?`);
  if (!confirmed) {
    return;
  }

  state.meals = state.meals.filter((meal) => meal.id !== mealId);
  Object.values(state.weeks).forEach((week) => {
    week.mealIds = week.mealIds.filter((id) => id !== mealId);
    week.defaultMealIds = week.defaultMealIds.filter((id) => id !== mealId);
  });
  saveState();
  render();
}

function resetWeekToDefaultRotation(weekKey) {
  ensureWeek(weekKey);
  const fullDefault = buildCompleteDefaultMenu(weekKey, state.weeks[weekKey].defaultMealIds);
  state.weeks[weekKey].defaultMealIds = fullDefault;
  state.weeks[weekKey].mealIds = [...fullDefault];
  saveState();
  render();
}

function randomizeWeekMenu(weekKey) {
  ensureWeek(weekKey);
  const availableIds = state.meals.map((meal) => meal.id);
  if (availableIds.length === 0) {
    state.weeks[weekKey].mealIds = [];
    saveState();
    render();
    return;
  }

  const targetCount = Math.min(MAX_WEEK_MEALS, availableIds.length);
  const currentKey = state.weeks[weekKey].mealIds.slice().sort().join("|");
  let nextIds = [];

  for (let i = 0; i < 8; i += 1) {
    nextIds = pickRandomUnique(availableIds, targetCount);
    const nextKey = nextIds.slice().sort().join("|");
    if (nextKey !== currentKey || availableIds.length <= targetCount) {
      break;
    }
  }

  state.weeks[weekKey].mealIds = nextIds;
  saveState();
  render();
}

function pickRandomUnique(source, count) {
  const copy = [...source];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function getEffectiveIngredientCountsForWeek(weekKey) {
  ensureWeek(weekKey);
  const week = state.weeks[weekKey];
  const autoCounts = getAutoIngredientCountsForWeek(weekKey);
  const result = new Map(autoCounts);
  const removed = new Set(week.ingredientEdits.removed);

  removed.forEach((ingredient) => {
    result.delete(ingredient);
  });

  week.ingredientEdits.added.forEach((ingredient) => {
    result.set(ingredient, (result.get(ingredient) || 0) + 1);
  });

  return result;
}

function getAutoIngredientCountsForWeek(weekKey) {
  ensureWeek(weekKey);
  const week = state.weeks[weekKey];
  const autoCounts = new Map();

  week.mealIds.forEach((id) => {
    const meal = state.meals.find((m) => m.id === id);
    if (!meal) return;
    meal.ingredients.forEach((ingredient) => {
      autoCounts.set(ingredient, (autoCounts.get(ingredient) || 0) + 1);
    });
  });

  return autoCounts;
}

function addCustomIngredient(rawName) {
  const ingredient = rawName.trim().toLowerCase();
  if (!ingredient) {
    return;
  }

  ensureWeek(state.activeWeek);
  const week = state.weeks[state.activeWeek];
  const autoCounts = getAutoIngredientCountsForWeek(state.activeWeek);
  const removedIndex = week.ingredientEdits.removed.indexOf(ingredient);

  if (autoCounts.has(ingredient) && removedIndex >= 0) {
    week.ingredientEdits.removed.splice(removedIndex, 1);
  } else {
    week.ingredientEdits.added.push(ingredient);
  }

  saveState();
  render();
}

function removeIngredientForWeek(ingredient) {
  ensureWeek(state.activeWeek);
  const week = state.weeks[state.activeWeek];
  const autoCounts = getAutoIngredientCountsForWeek(state.activeWeek);
  const hasAutoIngredient = autoCounts.has(ingredient);
  const removed = week.ingredientEdits.removed;
  const added = week.ingredientEdits.added;
  const removedIndex = removed.indexOf(ingredient);

  if (hasAutoIngredient && removedIndex < 0) {
    removed.push(ingredient);
    week.checkedIngredients = week.checkedIngredients.filter((x) => x !== ingredient);
  } else {
    const addedIndex = added.indexOf(ingredient);
    if (addedIndex >= 0) {
      added.splice(addedIndex, 1);
    }
    week.checkedIngredients = week.checkedIngredients.filter((x) => x !== ingredient);
  }

  saveState();
  render();
}

function resetIngredientsForWeek(weekKey) {
  ensureWeek(weekKey);
  state.weeks[weekKey].ingredientEdits = { added: [], removed: [] };
  state.weeks[weekKey].checkedIngredients = [];
  saveState();
  render();
}

function setIngredientCheckedForWeek(ingredient, checked) {
  ensureWeek(state.activeWeek);
  const week = state.weeks[state.activeWeek];
  const i = week.checkedIngredients.indexOf(ingredient);

  if (checked && i < 0) {
    week.checkedIngredients.push(ingredient);
  }

  if (!checked && i >= 0) {
    week.checkedIngredients.splice(i, 1);
  }

  saveState();
  render();
}

function ensureWeek(weekKey) {
  if (!state.weeks[weekKey]) {
    const defaultMealIds = generateWeightedDefaultMealsForWeek(weekKey);
    state.weeks[weekKey] = {
      mealIds: [...defaultMealIds],
      defaultMealIds,
      ingredientEdits: { added: [], removed: [] },
      checkedIngredients: []
    };
    return;
  }
  normalizeWeekData(state.weeks[weekKey]);
  state.weeks[weekKey].defaultMealIds = buildCompleteDefaultMenu(weekKey, state.weeks[weekKey].defaultMealIds);
  state.weeks[weekKey].mealIds = sanitizeMealIdList(state.weeks[weekKey].mealIds);
}

function normalizeWeekData(week) {
  if (!Array.isArray(week.mealIds)) {
    week.mealIds = [];
  }
  if (!Array.isArray(week.defaultMealIds)) {
    week.defaultMealIds = [];
  }
  if (!Array.isArray(week.checkedIngredients)) {
    week.checkedIngredients = [];
  }
  if (!week.ingredientEdits || typeof week.ingredientEdits !== "object") {
    week.ingredientEdits = { added: [], removed: [] };
  }
  if (!Array.isArray(week.ingredientEdits.added)) {
    week.ingredientEdits.added = [];
  }
  if (!Array.isArray(week.ingredientEdits.removed)) {
    week.ingredientEdits.removed = [];
  }
}

function generateWeightedDefaultMealsForWeek(weekKey) {
  const currentWeekSerial = weekKeyToSerial(weekKey);
  const candidateIds = state.meals.map((meal) => meal.id);
  if (candidateIds.length <= MAX_WEEK_MEALS) {
    return [...candidateIds];
  }

  const lastUsedSerialByMealId = getLastUsedSerialByMealIdBeforeWeek(weekKey);
  const selected = [];
  const remaining = [...candidateIds];

  while (selected.length < MAX_WEEK_MEALS && remaining.length > 0) {
    const weighted = remaining.map((mealId) => {
      const lastUsedSerial = lastUsedSerialByMealId.get(mealId);
      const age = Number.isInteger(lastUsedSerial)
        ? Math.max(1, currentWeekSerial - lastUsedSerial)
        : NEVER_USED_AGE_BONUS;
      const weight = Math.pow(age, AGE_WEIGHT_POWER) + Math.random() * 0.25;
      return { mealId, weight };
    });

    const pick = pickByWeight(weighted);
    selected.push(pick);
    const index = remaining.indexOf(pick);
    if (index >= 0) {
      remaining.splice(index, 1);
    }
  }

  return selected;
}

function buildCompleteDefaultMenu(weekKey, baseMealIds) {
  const availableIds = state.meals.map((meal) => meal.id);
  const targetCount = Math.min(MAX_WEEK_MEALS, availableIds.length);
  let result = sanitizeMealIdList(baseMealIds).slice(0, targetCount);

  if (result.length >= targetCount) {
    return result;
  }

  const currentWeekSerial = weekKeyToSerial(weekKey);
  const lastUsedSerialByMealId = getLastUsedSerialByMealIdBeforeWeek(weekKey);
  const remaining = availableIds.filter((id) => !result.includes(id));

  while (result.length < targetCount && remaining.length > 0) {
    const weighted = remaining.map((mealId) => {
      const lastUsedSerial = lastUsedSerialByMealId.get(mealId);
      const age = Number.isInteger(lastUsedSerial)
        ? Math.max(1, currentWeekSerial - lastUsedSerial)
        : NEVER_USED_AGE_BONUS;
      const weight = Math.pow(age, AGE_WEIGHT_POWER) + Math.random() * 0.25;
      return { mealId, weight };
    });

    const pick = pickByWeight(weighted);
    result.push(pick);
    const index = remaining.indexOf(pick);
    if (index >= 0) {
      remaining.splice(index, 1);
    }
  }

  return result;
}

function pickByWeight(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return items[Math.floor(Math.random() * items.length)].mealId;
  }

  let cursor = Math.random() * totalWeight;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item.mealId;
    }
  }

  return items[items.length - 1].mealId;
}

function getLastUsedSerialByMealIdBeforeWeek(weekKey) {
  const targetSerial = weekKeyToSerial(weekKey);
  const usage = new Map();

  Object.entries(state.weeks).forEach(([key, week]) => {
    const serial = weekKeyToSerial(key);
    if (serial >= targetSerial) {
      return;
    }
    const mealIds = Array.isArray(week.mealIds) ? week.mealIds : [];
    mealIds.forEach((mealId) => {
      const prev = usage.get(mealId);
      if (!Number.isInteger(prev) || serial > prev) {
        usage.set(mealId, serial);
      }
    });
  });

  return usage;
}

function weekKeyToSerial(weekKey) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) {
    return 0;
  }
  const year = Number.parseInt(match[1], 10);
  const week = Number.parseInt(match[2], 10);
  if (Number.isNaN(year) || Number.isNaN(week)) {
    return 0;
  }
  return (year * 100) + week;
}

function sanitizeMealIdList(mealIds) {
  if (!Array.isArray(mealIds)) {
    return [];
  }
  const allowed = new Set(state.meals.map((meal) => meal.id));
  return mealIds.filter((id, index) => allowed.has(id) && mealIds.indexOf(id) === index).slice(0, MAX_WEEK_MEALS);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        meals: Array.isArray(parsed.meals) ? parsed.meals : structuredClone(defaultMeals),
        weeks: parsed.weeks || {},
        activeWeek: parsed.activeWeek || currentWeekString()
      };
    }
  } catch {
    // Fallback handled below.
  }

  return {
    meals: structuredClone(defaultMeals),
    weeks: {},
    activeWeek: currentWeekString()
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleRemoteSave();
}

function startRemoteSync() {
  if (!supabaseClient) {
    return;
  }

  void fetchRemoteState({ force: true, renderAfter: true });

  if (remotePollTimer) {
    clearInterval(remotePollTimer);
  }
  remotePollTimer = setInterval(() => {
    void fetchRemoteState({ force: false, renderAfter: true });
  }, REMOTE_POLL_MS);
}

function scheduleRemoteSave() {
  if (!supabaseClient || isApplyingRemoteState) {
    return;
  }

  if (remoteSaveTimer) {
    clearTimeout(remoteSaveTimer);
  }

  remoteSaveTimer = setTimeout(() => {
    void pushStateToRemote();
  }, REMOTE_SAVE_DEBOUNCE_MS);
}

async function pushStateToRemote() {
  if (!supabaseClient) {
    return;
  }

  const payload = {
    id: FAMILY_PLAN_ID,
    state: getSerializableState(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseClient
    .from(REMOTE_TABLE)
    .upsert(payload)
    .select("updated_at")
    .single();

  if (error) {
    console.error("Kunde inte spara till Supabase:", error.message);
    return;
  }

  lastRemoteUpdatedAt = data?.updated_at || payload.updated_at;
}

async function fetchRemoteState({ force, renderAfter }) {
  if (!supabaseClient) {
    return;
  }

  const { data, error } = await supabaseClient
    .from(REMOTE_TABLE)
    .select("state, updated_at")
    .eq("id", FAMILY_PLAN_ID)
    .maybeSingle();

  if (error) {
    console.error("Kunde inte läsa från Supabase:", error.message);
    return;
  }

  if (!data || !data.state || typeof data.state !== "object") {
    if (force) {
      void pushStateToRemote();
    }
    return;
  }

  const incomingTs = Date.parse(data.updated_at || "");
  const currentTs = Date.parse(lastRemoteUpdatedAt || "");
  const shouldApply = force || !lastRemoteUpdatedAt || (Number.isFinite(incomingTs) && incomingTs > currentTs);

  if (!shouldApply) {
    return;
  }

  applyRemoteState(data.state);
  lastRemoteUpdatedAt = data.updated_at || lastRemoteUpdatedAt;
  if (renderAfter) {
    render();
  }
}

function applyRemoteState(remoteState) {
  isApplyingRemoteState = true;

  state.meals = Array.isArray(remoteState.meals) ? remoteState.meals : structuredClone(defaultMeals);
  state.weeks = remoteState.weeks && typeof remoteState.weeks === "object" ? remoteState.weeks : {};
  state.activeWeek = typeof remoteState.activeWeek === "string" ? remoteState.activeWeek : currentWeekString();

  ensureWeek(state.activeWeek);
  Object.values(state.weeks).forEach((week) => normalizeWeekData(week));
  weekPicker.value = state.activeWeek;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  isApplyingRemoteState = false;
}

function getSerializableState() {
  return {
    meals: state.meals,
    weeks: state.weeks,
    activeWeek: state.activeWeek
  };
}

function currentWeekString() {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
