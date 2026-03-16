import { useEffect, useMemo, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "./App.css";

function App() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("ALL_TASKS");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [contextMenu, setContextMenu] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [newTask, setNewTask] = useState({
    title: "",
    dueDate: "",
    status: "PENDING",
    category: "SCHOOL",
  });

  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");

  const protectedCategories = ["PERSONAL", "WORK", "SCHOOL", "OTHER"];

  const loadData = async () => {
    try {
      setError("");
      const response = await fetch("http://localhost:8080/api/tasks", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }

      const data = await response.json();
      setTasks(data);
    } catch (err) {
      console.error(err);
      setError("Could not connect to backend.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const categories = useMemo(() => {
    const base = ["PERSONAL", "WORK", "SCHOOL", "OTHER"];
    const fromTasks = tasks.map((task) => task.category || "OTHER").filter(Boolean);
    return [...new Set([...base, ...fromTasks])];
  }, [tasks]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setNewTask((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setNewTask({
      title: "",
      dueDate: "",
      status: "PENDING",
      category: "SCHOOL",
    });
    setUseCustomCategory(false);
    setCustomCategory("");
    setEditingTaskId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setError("");

      const finalCategory = useCustomCategory
        ? customCategory.trim().toUpperCase()
        : newTask.category;

      if (!finalCategory) {
        throw new Error("Category is required");
      }

      const payload = {
        ...newTask,
        description: "",
        category: finalCategory,
        courseId: 1,
      };

      const url = editingTaskId
        ? `http://localhost:8080/api/tasks/${editingTaskId}`
        : "http://localhost:8080/api/tasks";

      const method = editingTaskId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(editingTaskId ? "Failed to update task" : "Failed to create task");
      }

      resetForm();
      setActiveView("ALL_TASKS");
      loadData();
    } catch (err) {
      console.error(err);
      setError(editingTaskId ? "Could not update task." : "Could not create task.");
    }
  };

  const startEditTask = (task) => {
    setEditingTaskId(task.id);

    if (
      task.category &&
      !["PERSONAL", "WORK", "SCHOOL", "OTHER"].includes(task.category)
    ) {
      setUseCustomCategory(true);
      setCustomCategory(task.category);
      setNewTask({
        title: task.title || "",
        dueDate: task.dueDate || "",
        status: task.status || "PENDING",
        category: "SCHOOL",
      });
    } else {
      setUseCustomCategory(false);
      setCustomCategory("");
      setNewTask({
        title: task.title || "",
        dueDate: task.dueDate || "",
        status: task.status || "PENDING",
        category: task.category || "OTHER",
      });
    }

    setActiveView("ADD_TASK");
  };

  const markAsDone = async (taskId) => {
    try {
      setError("");

      const response = await fetch(`http://localhost:8080/api/tasks/${taskId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "DONE" }),
      });

      if (!response.ok) {
        throw new Error("Failed to update task.");
      }

      loadData();
    } catch (err) {
      console.error(err);
      setError("Could not update task.");
    }
  };

  const deleteTask = async (taskId) => {
    const confirmed = window.confirm("Delete this task?");
    if (!confirmed) return;

    try {
      setError("");

      const response = await fetch(`http://localhost:8080/api/tasks/${taskId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete task.");
      }

      loadData();
    } catch (err) {
      console.error(err);
      setError("Could not delete task.");
    }
  };

  const deleteCategory = async (category) => {
    if (protectedCategories.includes(category)) return;

    const confirmed = window.confirm(
      `Delete category "${category}" and move its tasks to OTHER?`
    );
    if (!confirmed) return;

    try {
      setError("");

      const response = await fetch("http://localhost:8080/api/tasks/category/move-to-other", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ oldCategory: category }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete category.");
      }

      if (activeCategory === category) {
        setActiveCategory("OTHER");
      }

      setContextMenu(null);
      loadData();
    } catch (err) {
      console.error(err);
      setError("Could not delete category.");
    }
  };

  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (activeCategory !== "ALL") {
      result = result.filter((task) => (task.category || "OTHER") === activeCategory);
    }

    if (activeView === "ALL_TASKS" && searchTerm.trim() !== "") {
      result = result.filter((task) =>
        (task.title || "").toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return result;
  }, [tasks, activeCategory, activeView, searchTerm]);

const overdueTasks = useMemo(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return filteredTasks.filter((task) => {
    if (!task.dueDate || task.status === "DONE") return false;
    const due = new Date(task.dueDate);
    return due < today;
  });
}, [filteredTasks]);

  const selectedDateString = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, [selectedDate]);

  const selectedDateTasks = useMemo(() => {
    return filteredTasks.filter((task) => task.dueDate === selectedDateString);
  }, [filteredTasks, selectedDateString]);

  const taskDates = useMemo(() => {
    return new Set(tasks.map((task) => task.dueDate));
  }, [tasks]);

  const sidebarButtonStyle = (isActive = false) => ({
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    marginBottom: "10px",
    backgroundColor: isActive ? "#8a8a8a" : "#6f6f6f",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
  });

  const actionButtonStyle = {
    padding: "7px 12px",
    fontSize: "13px",
    cursor: "pointer",
    borderRadius: "8px",
    border: "1px solid #444",
    background: "#2a2a2a",
    color: "white",
  };

  const selectCategory = (category) => {
    setActiveCategory(category);
    setActiveView("ALL_TASKS");
  };

  const handleCalendarDateClick = (date) => {
    setSelectedDate(date);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    resetForm();
    setNewTask((prev) => ({
      ...prev,
      dueDate: dateString,
    }));
    setActiveView("ADD_TASK");
  };

  const tileContent = ({ date, view }) => {
    if (view !== "month") return null;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    if (taskDates.has(dateString)) {
      return (
        <div
          style={{
            marginTop: "4px",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#60a5fa",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        />
      );
    }

    return null;
  };

  const renderTaskRow = (task) => (
    <div key={task.id} className="task-row">
      <div>
        <div className="task-title">
          <strong>{task.title}</strong>
        </div>
        <div className="task-meta">
          {(task.category || "OTHER")} • {task.status} • Due: {task.dueDate}
        </div>
      </div>

      <div className="task-actions">
        {task.status !== "DONE" && (
          <button style={actionButtonStyle} onClick={() => markAsDone(task.id)}>
            Done
          </button>
        )}
        <button style={actionButtonStyle} onClick={() => startEditTask(task)}>
          Edit
        </button>
        <button style={actionButtonStyle} onClick={() => deleteTask(task.id)}>
          Delete
        </button>
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      <div className="sidebar">
        <h1 className="sidebar-title">Inbox</h1>

        <button
          onClick={() => {
            resetForm();
            setActiveView("ADD_TASK");
          }}
          style={sidebarButtonStyle(activeView === "ADD_TASK")}
        >
          Add Task
        </button>

        <button
          onClick={() => {
            setActiveCategory("ALL");
            setActiveView("ALL_TASKS");
          }}
          style={sidebarButtonStyle(activeView === "ALL_TASKS" && activeCategory === "ALL")}
        >
          All Tasks
        </button>

        <button
          onClick={() => setActiveView("CALENDAR")}
          style={sidebarButtonStyle(activeView === "CALENDAR")}
        >
          Calendar
        </button>

        <div className="category-section">
          <h3 className="category-title">Category</h3>

          {categories.map((category) => (
            <div
              key={category}
              onContextMenu={(e) => {
                if (protectedCategories.includes(category)) return;
                e.preventDefault();
                e.stopPropagation();
                setContextMenu(contextMenu === category ? null : category);
              }}
              className="category-row"
            >
              <button
                onClick={() => selectCategory(category)}
                style={{
                  ...sidebarButtonStyle(activeCategory === category),
                  marginBottom: 0,
                  flex: 1,
                }}
              >
                {category.charAt(0) + category.slice(1).toLowerCase()}
              </button>

              {contextMenu === category && !protectedCategories.includes(category) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCategory(category);
                  }}
                  className="delete-category-btn"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="main-panel">
        {error && <p className="error-text">{error}</p>}

        {activeView === "ADD_TASK" && (
          <div className="panel-card">
            <h2>{editingTaskId ? "Edit Task" : "Add Task"}</h2>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <input
                  type="text"
                  name="title"
                  placeholder="Task title"
                  value={newTask.title}
                  onChange={handleChange}
                  required
                  className="input-control wide-input"
                />

                <input
                  type="date"
                  name="dueDate"
                  value={newTask.dueDate}
                  onChange={handleChange}
                  required
                  className="input-control"
                />

                <select
                  name="status"
                  value={newTask.status}
                  onChange={handleChange}
                  className="input-control"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="DONE">DONE</option>
                </select>

                {!useCustomCategory ? (
                  <select
                    name="category"
                    value={newTask.category}
                    onChange={handleChange}
                    className="input-control"
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="New category"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="input-control"
                    required
                  />
                )}

                <button
                  type="button"
                  onClick={() => {
                    setUseCustomCategory(!useCustomCategory);
                    setCustomCategory("");
                  }}
                  className="main-btn"
                >
                  {useCustomCategory ? "Use Existing Category" : "New Category"}
                </button>

                <button type="submit" className="main-btn">
                  {editingTaskId ? "Update" : "Save"}
                </button>

                {editingTaskId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="main-btn"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {activeView === "ALL_TASKS" && (
          <div className="panel-card">
            <h2>{activeCategory === "ALL" ? "All Tasks" : activeCategory}</h2>

            <div className="search-wrap">
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-control search-input"
              />
            </div>

            {overdueTasks.length > 0 && (
              <div className="overdue-box">
                <h3>Overdue</h3>
                {overdueTasks.map((task) => (
                  <div key={task.id} className="overdue-item">
                    <strong>{task.title}</strong>
                    <span>
                      {" "}• {(task.category || "OTHER")} • Due: {task.dueDate}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {filteredTasks.length === 0 ? (
              <p>No tasks match your search/category.</p>
            ) : (
              <div>{filteredTasks.map((task) => renderTaskRow(task))}</div>
            )}
          </div>
        )}

        {activeView === "CALENDAR" && (
          <div className="panel-card">
            <h2>{activeCategory === "ALL" ? "Calendar" : `${activeCategory} Calendar`}</h2>

            <p className="helper-text">
              Click a date to open Add Task with that date filled in.
            </p>

            <div className="calendar-wrap">
              <Calendar
                onChange={handleCalendarDateClick}
                value={selectedDate}
                tileContent={tileContent}
              />
            </div>

            <div>
              <h3>Tasks for {selectedDateString}</h3>

              {selectedDateTasks.length === 0 ? (
                <p>No tasks on this date.</p>
              ) : (
                <div>{selectedDateTasks.map((task) => renderTaskRow(task))}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;