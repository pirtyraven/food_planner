const STORAGE_KEY = "meal-planner-v3";
const MAX_WEEK_MEALS = 4;
const NEVER_USED_AGE_BONUS = 200;
const AGE_WEIGHT_POWER = 1.8;
const APP_CONFIG = window.APP_CONFIG || {};
const SUPABASE_URL = APP_CONFIG.SUPABASE_URL || "https://fpjxossedqvcetgoppwg.supabase.co";
const SUPABASE_ANON_KEY = APP_CONFIG.SUPABASE_ANON_KEY || "";
const FAMILY_PLAN_ID = APP_CONFIG.FAMILY_PLAN_ID || "per-familj";
const REMOTE_TABLE = APP_CONFIG.REMOTE_TABLE || "family_plans";
const REMOTE_POLL_MS = APP_CONFIG.REMOTE_POLL_MS || 15000;
const REMOTE_SAVE_DEBOUNCE_MS = APP_CONFIG.REMOTE_SAVE_DEBOUNCE_MS || 600;
const DEFAULT_ACCOUNTS = [
  { id: "familjen-elisson", name: "Familjen Elisson" },
  { id: "heidi-richard", name: "Heidi/Richard" },
  { id: "familjen-winther", name: "Familjen Winther" }
];

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

const defaultMeals = defaultMealDefinitions.map((meal, index) => ({
  id: crypto.randomUUID(),
  name: meal.name,
  ingredients: meal.ingredients,
  ownerAccountId: index < Math.ceil(defaultMealDefinitions.length / 2) ? DEFAULT_ACCOUNTS[0].id : DEFAULT_ACCOUNTS[1].id
}));

const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
let remoteSaveTimer = null;
let lastRemoteUpdatedAt = null;
let isApplyingRemoteState = false;
let remotePollTimer = null;
let remoteChannel = null;
let openAddSlotIndex = null;
let openAddSearchQuery = "";

const state = loadState();

const accountPicker = document.getElementById("accountPicker");
const showSharedMeals = document.getElementById("showSharedMeals");
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
  ensureAccounts();
  if (!state.activeAccountId || !state.accounts.some((account) => account.id === state.activeAccountId)) {
    state.activeAccountId = state.accounts[0].id;
  }

  weekPicker.value = state.activeWeek || currentWeekString();
  if (!state.activeWeek) {
    state.activeWeek = weekPicker.value;
  }

  ensureStateMeta(state);
  ensureMealOwners();
  migrateLegacyWeekKeys(state);
  ensureWeek(state.activeWeek);
  Object.values(state.weeks).forEach((week) => normalizeWeekData(week));

  renderAccountPicker();
  showSharedMeals.checked = getAccountSettings().allowSharedMeals;
  registerEvents();
  render();
  startRemoteSync();
  registerServiceWorker();
}

function registerEvents() {
  accountPicker.addEventListener("change", () => {
    state.activeAccountId = accountPicker.value;
    ensureAccounts();
    ensureWeek(state.activeWeek);
    showSharedMeals.checked = getAccountSettings().allowSharedMeals;
    saveState({ syncRemote: false });
    render();
  });

  showSharedMeals.addEventListener("change", () => {
    getAccountSettings().allowSharedMeals = showSharedMeals.checked;
    markAccountSettingsUpdated(state.activeAccountId);
    saveState();
    render();
  });

  weekPicker.addEventListener("change", () => {
    state.activeWeek = weekPicker.value;
    ensureWeek(state.activeWeek);
    saveState({ syncRemote: false });
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

    if (!name) {
      return;
    }

    state.meals.push({
      id: crypto.randomUUID(),
      name,
      ingredients,
      ownerAccountId: state.activeAccountId
    });
    markMealsUpdated(state.activeAccountId);

    mealName.value = "";
    mealIngredients.value = "";
    saveState();
    render();
  });

  clearWeekBtn.addEventListener("click", () => {
    ensureWeek(state.activeWeek);
    getWeek(state.activeWeek).mealIds = [];
    markWeekUpdated(state.activeWeek);
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
  selectedCount.textContent = `${getWeek(state.activeWeek).mealIds.length} / ${MAX_WEEK_MEALS} valda`;
}

function renderRotationStatus() {
  rotationStatus.textContent = `Standard för ${state.activeWeek}: slumpad med vikt mot rätter som inte valts på länge.`;
}

function renderMeals() {
  mealList.innerHTML = "";
  const week = getWeek(state.activeWeek);
  const visibleMeals = getVisibleMealsForAccount();

  visibleMeals.forEach((meal) => {
    const li = document.createElement("li");

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = meal.name;
    if (meal.ownerAccountId !== state.activeAccountId) {
      const ownerTag = document.createElement("small");
      ownerTag.textContent = `(${getAccountName(meal.ownerAccountId)})`;
      info.append(title, document.createElement("br"), ownerTag, document.createElement("br"));
    } else {
      info.append(title, document.createElement("br"));
    }

    const ingredientsLink = document.createElement("button");
    ingredientsLink.type = "button";
    ingredientsLink.className = "ingredients-link";
    ingredientsLink.textContent = "ingredienser";
    ingredientsLink.addEventListener("click", () => {
      openIngredientsPopup(meal);
    });

    info.append(ingredientsLink);

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

    actions.append(checkboxLabel);
    if (meal.ownerAccountId === state.activeAccountId) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-danger mini";
      deleteBtn.textContent = "Radera";
      deleteBtn.addEventListener("click", () => deleteMeal(meal.id));
      actions.append(deleteBtn);
    }
    li.append(info, actions);
    mealList.appendChild(li);
  });
}

function openIngredientsPopup(meal) {
  ingredientsDialogTitle.textContent = `Ingredienser: ${meal.name}`;
  const ingredientText = Array.isArray(meal.ingredients) && meal.ingredients.length > 0
    ? meal.ingredients.join(", ")
    : "Inga ingredienser angivna.";
  ingredientsDialogContent.textContent = ingredientText;

  if (typeof ingredientsDialog.showModal === "function") {
    ingredientsDialog.showModal();
    return;
  }

  alert(`${meal.name}\n\n${ingredientText}`);
}

function renderSelectedMeals() {
  selectedList.innerHTML = "";
  const week = getWeek(state.activeWeek);
  const mealIds = week.mealIds;
  const availableMeals = getVisibleMealsForAccount().filter((meal) => !mealIds.includes(meal.id));

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
      const panel = document.createElement("div");
      panel.className = "slot-picker";

      const search = document.createElement("input");
      search.type = "search";
      search.className = "slot-search";
      search.placeholder = "Sök maträtt";
      search.value = openAddSearchQuery;

      const options = document.createElement("div");
      options.className = "slot-options";

      const renderSlotOptions = () => {
        options.innerHTML = "";
        const query = openAddSearchQuery.trim().toLowerCase();
        const filtered = query
          ? availableMeals.filter((meal) => meal.name.toLowerCase().includes(query))
          : availableMeals;

        if (filtered.length === 0) {
          const empty = document.createElement("small");
          empty.className = "slot-empty";
          empty.textContent = "Inga träffar";
          options.append(empty);
          return;
        }

        filtered.forEach((meal) => {
          const optionBtn = document.createElement("button");
          optionBtn.type = "button";
          optionBtn.className = "slot-option-btn";
          optionBtn.textContent = meal.name;
          optionBtn.addEventListener("click", () => {
            openAddSlotIndex = null;
            openAddSearchQuery = "";
            setMealSelection(meal.id, true);
          });
          options.append(optionBtn);
        });
      };

      search.addEventListener("input", () => {
        openAddSearchQuery = search.value.trim().toLowerCase();
        renderSlotOptions();
      });
      renderSlotOptions();

      const actions = document.createElement("div");
      actions.className = "meal-actions";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-secondary mini";
      cancelBtn.textContent = "Stäng";
      cancelBtn.addEventListener("click", () => {
        openAddSlotIndex = null;
        openAddSearchQuery = "";
        renderSelectedMeals();
      });

      actions.append(cancelBtn);
      panel.append(search, options, actions);
      li.append(panel);
    } else {
      const plusBtn = document.createElement("button");
      plusBtn.type = "button";
      plusBtn.className = "btn btn-secondary mini add-slot-btn";
      plusBtn.textContent = "+ Lägg till rätt";
      plusBtn.addEventListener("click", () => {
        openAddSlotIndex = slotIndex;
        openAddSearchQuery = "";
        renderSelectedMeals();
      });

      li.append(plusBtn);
    }

    selectedList.appendChild(li);
  }
}

function renderShoppingList() {
  shoppingList.innerHTML = "";
  const week = getWeek(state.activeWeek);
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
  const week = getWeek(state.activeWeek);
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

  markWeekUpdated(state.activeWeek);
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

  const ownerAccountId = meal.ownerAccountId || state.activeAccountId;

  state.meals = state.meals.filter((meal) => meal.id !== mealId);
  Object.values(state.weeks).forEach((week) => {
    week.mealIds = week.mealIds.filter((id) => id !== mealId);
    week.defaultMealIds = week.defaultMealIds.filter((id) => id !== mealId);
  });
  markMealsUpdated(ownerAccountId);
  Object.keys(state.weeks).forEach((weekKey) => markWeekUpdated(weekKey));
  saveState();
  render();
}

function resetWeekToDefaultRotation(weekKey) {
  ensureWeek(weekKey);
  const week = getWeek(weekKey);
  const fullDefault = buildCompleteDefaultMenu(weekKey, week.defaultMealIds);
  week.defaultMealIds = fullDefault;
  week.mealIds = [...fullDefault];
  markWeekUpdated(weekKey);
  saveState();
  render();
}

function randomizeWeekMenu(weekKey) {
  ensureWeek(weekKey);
  const availableIds = getVisibleMealsForAccount().map((meal) => meal.id);
  if (availableIds.length === 0) {
    getWeek(weekKey).mealIds = [];
    markWeekUpdated(weekKey);
    saveState();
    render();
    return;
  }

  const targetCount = Math.min(MAX_WEEK_MEALS, availableIds.length);
  const currentKey = getWeek(weekKey).mealIds.slice().sort().join("|");
  let nextIds = [];

  for (let i = 0; i < 8; i += 1) {
    nextIds = pickRandomUnique(availableIds, targetCount);
    const nextKey = nextIds.slice().sort().join("|");
    if (nextKey !== currentKey || availableIds.length <= targetCount) {
      break;
    }
  }

  getWeek(weekKey).mealIds = nextIds;
  markWeekUpdated(weekKey);
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
  const week = getWeek(weekKey);
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
  const week = getWeek(weekKey);
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
  const week = getWeek(state.activeWeek);
  const autoCounts = getAutoIngredientCountsForWeek(state.activeWeek);
  const removedIndex = week.ingredientEdits.removed.indexOf(ingredient);

  if (autoCounts.has(ingredient) && removedIndex >= 0) {
    week.ingredientEdits.removed.splice(removedIndex, 1);
  } else {
    week.ingredientEdits.added.push(ingredient);
  }

  markWeekUpdated(state.activeWeek);
  saveState();
  render();
}

function removeIngredientForWeek(ingredient) {
  ensureWeek(state.activeWeek);
  const week = getWeek(state.activeWeek);
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

  markWeekUpdated(state.activeWeek);
  saveState();
  render();
}

function resetIngredientsForWeek(weekKey) {
  ensureWeek(weekKey);
  const week = getWeek(weekKey);
  week.ingredientEdits = { added: [], removed: [] };
  week.checkedIngredients = [];
  markWeekUpdated(weekKey);
  saveState();
  render();
}

function setIngredientCheckedForWeek(ingredient, checked) {
  ensureWeek(state.activeWeek);
  const week = getWeek(state.activeWeek);
  const i = week.checkedIngredients.indexOf(ingredient);

  if (checked && i < 0) {
    week.checkedIngredients.push(ingredient);
  }

  if (!checked && i >= 0) {
    week.checkedIngredients.splice(i, 1);
  }

  markWeekUpdated(state.activeWeek);
  saveState();
  render();
}

function ensureWeek(weekKey) {
  const scopedKey = getScopedWeekKey(weekKey);
  if (!state.weeks[scopedKey]) {
    const defaultMealIds = generateWeightedDefaultMealsForWeek(weekKey);
    state.weeks[scopedKey] = {
      mealIds: [...defaultMealIds],
      defaultMealIds,
      ingredientEdits: { added: [], removed: [] },
      checkedIngredients: []
    };
    return;
  }
  normalizeWeekData(state.weeks[scopedKey]);
  state.weeks[scopedKey].defaultMealIds = buildCompleteDefaultMenu(weekKey, state.weeks[scopedKey].defaultMealIds);
  state.weeks[scopedKey].mealIds = sanitizeMealIdList(state.weeks[scopedKey].mealIds);
}

function getScopedWeekKey(weekKey, accountId = state.activeAccountId) {
  return `${accountId}::${weekKey}`;
}

function getWeek(weekKey) {
  return state.weeks[getScopedWeekKey(weekKey)];
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
  const candidateIds = getPlanningCandidateMeals().map((meal) => meal.id);
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
  const availableIds = getPlanningCandidateMeals().map((meal) => meal.id);
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
    const [accountId, plainWeekKey] = parseScopedWeekKey(key);
    if (accountId !== state.activeAccountId) {
      return;
    }
    const serial = weekKeyToSerial(plainWeekKey);
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

function ensureAccounts() {
  if (!Array.isArray(state.accounts)) {
    state.accounts = structuredClone(DEFAULT_ACCOUNTS);
    return;
  }

  DEFAULT_ACCOUNTS.forEach((defaultAccount) => {
    if (!state.accounts.some((account) => account.id === defaultAccount.id)) {
      state.accounts.push(structuredClone(defaultAccount));
    }
  });
}

function ensureMealOwners() {
  state.meals.forEach((meal) => {
    if (!meal.ownerAccountId || !state.accounts.some((account) => account.id === meal.ownerAccountId)) {
      meal.ownerAccountId = DEFAULT_ACCOUNTS[0].id;
    }
  });
}

function renderAccountPicker() {
  accountPicker.innerHTML = "";
  state.accounts.forEach((account) => {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = account.name;
    accountPicker.append(option);
  });
  accountPicker.value = state.activeAccountId;
}

function getAccountName(accountId) {
  const account = state.accounts.find((item) => item.id === accountId);
  return account ? account.name : accountId;
}

function getAccountSettings(accountId = state.activeAccountId) {
  if (!state.accountSettings || typeof state.accountSettings !== "object") {
    state.accountSettings = {};
  }
  if (!state.accountSettings[accountId]) {
    state.accountSettings[accountId] = { allowSharedMeals: false };
  }
  return state.accountSettings[accountId];
}

function getVisibleMealsForAccount(accountId = state.activeAccountId) {
  const settings = getAccountSettings(accountId);
  return state.meals.filter((meal) => settings.allowSharedMeals || meal.ownerAccountId === accountId);
}

function getPlanningCandidateMeals() {
  return state.meals.filter((meal) => meal.ownerAccountId === state.activeAccountId);
}

function parseScopedWeekKey(scopedKey) {
  const splitter = scopedKey.indexOf("::");
  if (splitter < 0) {
    return [DEFAULT_ACCOUNTS[0].id, scopedKey];
  }
  return [scopedKey.slice(0, splitter), scopedKey.slice(splitter + 2)];
}

function migrateLegacyWeekKeys(targetState) {
  const migrated = {};
  Object.entries(targetState.weeks || {}).forEach(([key, value]) => {
    if (key.includes("::")) {
      migrated[key] = value;
      return;
    }
    const scoped = `${DEFAULT_ACCOUNTS[0].id}::${key}`;
    migrated[scoped] = migrated[scoped] || value;
  });
  targetState.weeks = migrated;

  ensureStateMeta(targetState);
  const migratedMeta = {};
  Object.entries(targetState.meta.weeksUpdatedAt || {}).forEach(([key, value]) => {
    const scoped = key.includes("::") ? key : `${DEFAULT_ACCOUNTS[0].id}::${key}`;
    migratedMeta[scoped] = value;
  });
  targetState.meta.weeksUpdatedAt = migratedMeta;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        meals: Array.isArray(parsed.meals) ? parsed.meals : structuredClone(defaultMeals),
        weeks: parsed.weeks || {},
        activeWeek: parsed.activeWeek || currentWeekString(),
        activeAccountId: parsed.activeAccountId || DEFAULT_ACCOUNTS[0].id,
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : structuredClone(DEFAULT_ACCOUNTS),
        accountSettings: parsed.accountSettings || {},
        meta: parsed.meta || {}
      };
    }
  } catch {
    // Fallback handled below.
  }

  return {
    meals: structuredClone(defaultMeals),
    weeks: {},
    activeWeek: currentWeekString(),
    activeAccountId: DEFAULT_ACCOUNTS[0].id,
    accounts: structuredClone(DEFAULT_ACCOUNTS),
    accountSettings: {},
    meta: {}
  };
}

function saveState({ syncRemote = true } = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (syncRemote) {
    scheduleRemoteSave();
  }
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

  if (remoteChannel && typeof supabaseClient.removeChannel === "function") {
    void supabaseClient.removeChannel(remoteChannel);
  }

  remoteChannel = supabaseClient
    .channel(`family-plan-${FAMILY_PLAN_ID}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: REMOTE_TABLE, filter: `id=eq.${FAMILY_PLAN_ID}` },
      (payload) => {
        const incomingTs = Date.parse(payload?.new?.updated_at || "");
        const currentTs = Date.parse(lastRemoteUpdatedAt || "");
        if (!lastRemoteUpdatedAt || (Number.isFinite(incomingTs) && incomingTs > currentTs)) {
          void fetchRemoteState({ force: true, renderAfter: true });
        }
      }
    )
    .subscribe();
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
  const merged = mergeStates(state, remoteState);

  state.meals = merged.meals;
  state.weeks = merged.weeks;
  state.accounts = merged.accounts;
  state.accountSettings = merged.accountSettings;
  state.meta = merged.meta;
  state.activeWeek = state.activeWeek || currentWeekString();
  if (!state.activeAccountId || !state.accounts.some((account) => account.id === state.activeAccountId)) {
    state.activeAccountId = state.accounts[0]?.id || DEFAULT_ACCOUNTS[0].id;
  }

  ensureAccounts();
  ensureMealOwners();
  migrateLegacyWeekKeys(state);
  ensureWeek(state.activeWeek);
  Object.values(state.weeks).forEach((week) => normalizeWeekData(week));
  ensureStateMeta(state);
  renderAccountPicker();
  showSharedMeals.checked = getAccountSettings().allowSharedMeals;
  weekPicker.value = state.activeWeek;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  isApplyingRemoteState = false;
}

function getSerializableState() {
  return {
    meals: state.meals,
    weeks: state.weeks,
    accounts: state.accounts,
    accountSettings: state.accountSettings,
    meta: state.meta
  };
}

function ensureStateMeta(targetState) {
  if (!targetState.meta || typeof targetState.meta !== "object") {
    targetState.meta = {};
  }
  if (!targetState.meta.mealsUpdatedAt || typeof targetState.meta.mealsUpdatedAt !== "object") {
    targetState.meta.mealsUpdatedAt = {};
  }
  if (!targetState.meta.weeksUpdatedAt || typeof targetState.meta.weeksUpdatedAt !== "object") {
    targetState.meta.weeksUpdatedAt = {};
  }
  if (!targetState.meta.accountSettingsUpdatedAt || typeof targetState.meta.accountSettingsUpdatedAt !== "object") {
    targetState.meta.accountSettingsUpdatedAt = {};
  }
}

function markMealsUpdated(accountId = state.activeAccountId) {
  ensureStateMeta(state);
  state.meta.mealsUpdatedAt[accountId] = Date.now();
}

function markWeekUpdated(weekKey) {
  ensureStateMeta(state);
  const key = weekKey.includes("::") ? weekKey : getScopedWeekKey(weekKey);
  state.meta.weeksUpdatedAt[key] = Date.now();
}

function markAccountSettingsUpdated(accountId = state.activeAccountId) {
  ensureStateMeta(state);
  state.meta.accountSettingsUpdatedAt[accountId] = Date.now();
}

function mergeStates(localState, remoteStateRaw) {
  const local = structuredClone(localState);
  const remote = {
    meals: Array.isArray(remoteStateRaw?.meals) ? remoteStateRaw.meals : structuredClone(defaultMeals),
    weeks: remoteStateRaw?.weeks && typeof remoteStateRaw.weeks === "object" ? remoteStateRaw.weeks : {},
    accounts: Array.isArray(remoteStateRaw?.accounts) ? remoteStateRaw.accounts : structuredClone(DEFAULT_ACCOUNTS),
    accountSettings: remoteStateRaw?.accountSettings && typeof remoteStateRaw.accountSettings === "object"
      ? remoteStateRaw.accountSettings
      : {},
    meta: remoteStateRaw?.meta || {}
  };

  if (!Array.isArray(local.accounts)) {
    local.accounts = structuredClone(DEFAULT_ACCOUNTS);
  }
  if (!local.accountSettings || typeof local.accountSettings !== "object") {
    local.accountSettings = {};
  }

  ensureStateMeta(local);
  ensureStateMeta(remote);

  const accountIds = new Set([
    ...local.accounts.map((account) => account.id),
    ...remote.accounts.map((account) => account.id),
    ...DEFAULT_ACCOUNTS.map((account) => account.id)
  ]);
  const mergedAccounts = [];
  accountIds.forEach((accountId) => {
    const fromLocal = local.accounts.find((account) => account.id === accountId);
    const fromRemote = remote.accounts.find((account) => account.id === accountId);
    mergedAccounts.push(fromRemote || fromLocal || DEFAULT_ACCOUNTS.find((account) => account.id === accountId));
  });

  const mergedMeals = [];
  accountIds.forEach((accountId) => {
    const localTs = Number(local.meta.mealsUpdatedAt?.[accountId] || 0);
    const remoteTs = Number(remote.meta.mealsUpdatedAt?.[accountId] || 0);
    const sourceMeals = remoteTs >= localTs ? remote.meals : local.meals;
    sourceMeals
      .filter((meal) => meal.ownerAccountId === accountId)
      .forEach((meal) => mergedMeals.push(meal));
  });

  const allWeekKeys = new Set([
    ...Object.keys(local.weeks || {}),
    ...Object.keys(remote.weeks || {})
  ]);
  const mergedWeeks = {};

  allWeekKeys.forEach((weekKey) => {
    const localWeek = local.weeks?.[weekKey];
    const remoteWeek = remote.weeks?.[weekKey];

    if (!localWeek) {
      mergedWeeks[weekKey] = remoteWeek;
      return;
    }
    if (!remoteWeek) {
      mergedWeeks[weekKey] = localWeek;
      return;
    }

    const localTs = Number(local.meta.weeksUpdatedAt?.[weekKey] || 0);
    const remoteTs = Number(remote.meta.weeksUpdatedAt?.[weekKey] || 0);
    mergedWeeks[weekKey] = remoteTs >= localTs ? remoteWeek : localWeek;
  });

  const mergedAccountSettings = {};
  accountIds.forEach((accountId) => {
    const localTs = Number(local.meta.accountSettingsUpdatedAt?.[accountId] || 0);
    const remoteTs = Number(remote.meta.accountSettingsUpdatedAt?.[accountId] || 0);
    mergedAccountSettings[accountId] = remoteTs >= localTs
      ? (remote.accountSettings?.[accountId] || { allowSharedMeals: false })
      : (local.accountSettings?.[accountId] || { allowSharedMeals: false });
  });

  const mergedMeta = {
    mealsUpdatedAt: {},
    weeksUpdatedAt: {},
    accountSettingsUpdatedAt: {}
  };

  accountIds.forEach((accountId) => {
    mergedMeta.mealsUpdatedAt[accountId] = Math.max(
      Number(local.meta.mealsUpdatedAt?.[accountId] || 0),
      Number(remote.meta.mealsUpdatedAt?.[accountId] || 0)
    );
    mergedMeta.accountSettingsUpdatedAt[accountId] = Math.max(
      Number(local.meta.accountSettingsUpdatedAt?.[accountId] || 0),
      Number(remote.meta.accountSettingsUpdatedAt?.[accountId] || 0)
    );
  });

  allWeekKeys.forEach((weekKey) => {
    mergedMeta.weeksUpdatedAt[weekKey] = Math.max(
      Number(local.meta.weeksUpdatedAt?.[weekKey] || 0),
      Number(remote.meta.weeksUpdatedAt?.[weekKey] || 0)
    );
  });

  return {
    meals: mergedMeals,
    weeks: mergedWeeks,
    accounts: mergedAccounts,
    accountSettings: mergedAccountSettings,
    meta: mergedMeta
  };
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Kunde inte registrera service worker:", error);
    });
  });
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
