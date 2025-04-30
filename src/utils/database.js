import { openDB } from "idb";

const DB_NAME = "shapesDB";
const STORE_NAME = "shapes";

export const initDB = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    },
  });
};

export const saveShapes = async (id, shapes) => {
  const db = await initDB();
  await db.clear(STORE_NAME); 
  await db.put(STORE_NAME, { id, shapes }); 

};

export const loadShapes = async () => {
  const db = await initDB();
  return await db.getAll(STORE_NAME);
};

export const deleteShape = async (id) => {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
};  


export const downloadShapesAsJSON = async () => {
  const shapes = await loadShapes(); // load from IndexedDB
  const blob = new Blob([JSON.stringify(shapes, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "shapes.json"; // filename for downloaded file
  a.click();

  URL.revokeObjectURL(url);
};