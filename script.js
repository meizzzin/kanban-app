const STORAGE_KEY = "minimal_todos_v1";

const CATEGORY_META = {
  work: { label: "💼 工作", className: "badge-work" },
  life: { label: "🌿 生活", className: "badge-life" },
};

const PRIORITY_META = {
  high: { label: "🔥 High", className: "badge-priority-high", weight: 1 },
  medium: { label: "⚡ Medium", className: "badge-priority-medium", weight: 2 },
  low: { label: "🌱 Low", className: "badge-priority-low", weight: 3 },
};

const VALID_STATUSES = ["todo", "process", "done"];
const VALID_PRIORITIES = ["high", "medium", "low"];

const EMPTY_HINTS = {
  todo: "尚無待辦項目，可新增或拖曳卡片至此",
  process: "將正在進行的任務拖曳至此",
  done: "完成的任務可拖曳至此歸檔",
};

// 狀態管理
let todos = loadTodos();
let currentFilter = "all";
let draggedTodoId = null;

// DOM 元素
const todoForm = document.getElementById("todo-form");
const todoInput = document.getElementById("todo-input");
const todoAssignee = document.getElementById("todo-assignee");
const todoPriority = document.getElementById("todo-priority");
const todoCategory = document.getElementById("todo-category");
const remainingCountEl = document.getElementById("remaining-count");
const countAllEl = document.getElementById("count-all");
const countWorkEl = document.getElementById("count-work");
const countLifeEl = document.getElementById("count-life");
const filterTabs = document.querySelectorAll(".filter-tab");

const columnDropzones = {
  todo: document.getElementById("list-todo"),
  process: document.getElementById("list-process"),
  done: document.getElementById("list-done"),
};

const columnCounts = {
  todo: document.getElementById("col-count-todo"),
  process: document.getElementById("col-count-process"),
  done: document.getElementById("col-count-done"),
};

/**
 * 依優先程度 (High -> Medium -> Low) 進行排序，若優先程度相同則保持既有相對順序
 */
function sortTodosByPriority(list) {
  return [...list].sort((a, b) => {
    const weightA = (PRIORITY_META[a.priority] || PRIORITY_META.medium).weight;
    const weightB = (PRIORITY_META[b.priority] || PRIORITY_META.medium).weight;
    return weightA - weightB;
  });
}

/**
 * 從 localStorage 載入任務資料（自動相容舊版資料）
 */
function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const normalized = parsed.map((item) => {
      let status = item.status;
      if (!VALID_STATUSES.includes(status)) {
        status = item.completed ? "done" : "todo";
      }
      const priority = VALID_PRIORITIES.includes(item.priority)
        ? item.priority
        : "medium";

      return {
        ...item,
        status,
        priority,
        completed: status === "done",
      };
    });

    return sortTodosByPriority(normalized);
  } catch (err) {
    console.error("無法讀取本地儲存的待辦清單：", err);
    return [];
  }
}

/**
 * 將任務資料儲存至 localStorage
 */
function saveTodos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (err) {
    console.error("無法寫入本地儲存：", err);
  }
}

/**
 * 新增任務（預設進入 To-do 欄位，並依優先程度排序）
 */
function addTodo(text, assignee, priority, category) {
  const cleanText = text.trim();
  const cleanAssignee = assignee.trim();
  if (!cleanText) return;

  const validPriority = VALID_PRIORITIES.includes(priority) ? priority : "medium";

  const newTodo = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: cleanText,
    assignee: cleanAssignee,
    priority: validPriority,
    category: category === "life" ? "life" : "work",
    status: "todo",
    completed: false,
    createdAt: Date.now(),
  };

  todos.unshift(newTodo);
  todos = sortTodosByPriority(todos);
  saveTodos();
  renderTodos();
}

/**
 * 更新任務所屬欄位狀態並重新依照優先程度排序
 */
function moveTodoToStatus(todoId, targetStatus, beforeTodoId = null) {
  if (!VALID_STATUSES.includes(targetStatus)) return;
  const movingIndex = todos.findIndex((t) => t.id === todoId);
  if (movingIndex === -1) return;

  const [movingItem] = todos.splice(movingIndex, 1);
  movingItem.status = targetStatus;
  movingItem.completed = targetStatus === "done";

  if (beforeTodoId && beforeTodoId !== todoId) {
    const targetIndex = todos.findIndex((t) => t.id === beforeTodoId);
    if (targetIndex !== -1) {
      todos.splice(targetIndex, 0, movingItem);
    } else {
      todos.push(movingItem);
    }
  } else {
    todos.push(movingItem);
  }

  todos = sortTodosByPriority(todos);
  saveTodos();
  renderTodos();
}

/**
 * 刪除指定任務
 */
function deleteTodo(id) {
  todos = todos.filter((item) => item.id !== id);
  saveTodos();
  renderTodos();
}

/**
 * 更新統計數量
 */
function updateStats() {
  const remaining = todos.filter((t) => t.status !== "done").length;
  const workCount = todos.filter((t) => t.category === "work").length;
  const lifeCount = todos.filter((t) => t.category === "life").length;

  remainingCountEl.textContent = remaining;
  countAllEl.textContent = todos.length;
  countWorkEl.textContent = workCount;
  countLifeEl.textContent = lifeCount;
}

/**
 * 建立單張可拖曳任務卡片
 */
function createTodoCard(item) {
  const priorityKey = VALID_PRIORITIES.includes(item.priority)
    ? item.priority
    : "medium";
  const priorityInfo = PRIORITY_META[priorityKey];

  const card = document.createElement("article");
  card.className = `todo-card status-${item.status} priority-${priorityKey}`;
  card.draggable = true;
  card.dataset.id = item.id;

  // 拖曳事件
  card.addEventListener("dragstart", (e) => {
    draggedTodoId = item.id;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
  });

  card.addEventListener("dragend", () => {
    draggedTodoId = null;
    card.classList.remove("dragging");
    document
      .querySelectorAll(".kanban-column.drag-over")
      .forEach((col) => col.classList.remove("drag-over"));
  });

  // 卡片上方：任務標題 + 刪除按鈕
  const topDiv = document.createElement("div");
  topDiv.className = "card-top";

  const textSpan = document.createElement("span");
  textSpan.className = "todo-text";
  textSpan.textContent = item.text;

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn-delete";
  deleteBtn.title = "刪除任務";
  deleteBtn.setAttribute("aria-label", `刪除「${item.text}」`);
  deleteBtn.textContent = "✕";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteTodo(item.id);
  });

  topDiv.appendChild(textSpan);
  topDiv.appendChild(deleteBtn);

  // 卡片下方：優先程度標籤 + 分類標籤 + 負責人標籤
  const badgesDiv = document.createElement("div");
  badgesDiv.className = "todo-badges";

  const priorityBadge = document.createElement("span");
  priorityBadge.className = `badge ${priorityInfo.className}`;
  priorityBadge.textContent = priorityInfo.label;
  badgesDiv.appendChild(priorityBadge);

  const categoryInfo = CATEGORY_META[item.category] || CATEGORY_META.work;
  const categoryBadge = document.createElement("span");
  categoryBadge.className = `badge ${categoryInfo.className}`;
  categoryBadge.textContent = categoryInfo.label;
  badgesDiv.appendChild(categoryBadge);

  const assigneeBadge = document.createElement("span");
  assigneeBadge.className = "badge badge-assignee";
  assigneeBadge.textContent = `👤 ${item.assignee ? item.assignee : "未指派"}`;
  badgesDiv.appendChild(assigneeBadge);

  card.appendChild(topDiv);
  card.appendChild(badgesDiv);

  return card;
}

/**
 * 渲染三欄看板（各欄內部自動按照 High -> Medium -> Low 排序）
 */
function renderTodos() {
  updateStats();

  const filtered = sortTodosByPriority(
    todos.filter((item) => {
      if (currentFilter === "all") return true;
      return item.category === currentFilter;
    })
  );

  VALID_STATUSES.forEach((status) => {
    const container = columnDropzones[status];
    const itemsInCol = filtered.filter((item) => item.status === status);

    columnCounts[status].textContent = itemsInCol.length;
    container.innerHTML = "";

    if (itemsInCol.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "column-empty";
      emptyDiv.textContent = EMPTY_HINTS[status];
      container.appendChild(emptyDiv);
      return;
    }

    itemsInCol.forEach((item) => {
      container.appendChild(createTodoCard(item));
    });
  });
}

/**
 * 根據滑鼠在欄位中的垂直座標，找出要插入在哪張卡片之前
 */
function getCardAfterDragPosition(container, mouseY) {
  const cards = [...container.querySelectorAll(".todo-card:not(.dragging)")];
  return cards.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = mouseY - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

/**
 * 初始化三個欄位的拖放區 (Dropzone) 事件
 */
function setupKanbanDragAndDrop() {
  const columns = document.querySelectorAll(".kanban-column");

  columns.forEach((col) => {
    const status = col.dataset.status;
    const dropzone = col.querySelector(".column-dropzone");

    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      col.classList.add("drag-over");
    });

    col.addEventListener("dragleave", (e) => {
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove("drag-over");
      }
    });

    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");

      const id = draggedTodoId || e.dataTransfer.getData("text/plain");
      if (!id) return;

      const afterElement = getCardAfterDragPosition(dropzone, e.clientY);
      const beforeTodoId = afterElement ? afterElement.dataset.id : null;

      moveTodoToStatus(id, status, beforeTodoId);
    });
  });
}

// 事件監聽：表單送出
todoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addTodo(
    todoInput.value,
    todoAssignee.value,
    todoPriority.value,
    todoCategory.value
  );
  todoInput.value = "";
  todoAssignee.value = "";
  todoPriority.value = "medium";
  todoInput.focus();
});

// 事件監聽：分類篩選切換
filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    currentFilter = tab.dataset.filter || "all";
    filterTabs.forEach((t) => {
      const isActive = t === tab;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", String(isActive));
    });
    renderTodos();
  });
});

// 啟動看板與渲染
setupKanbanDragAndDrop();
renderTodos();
