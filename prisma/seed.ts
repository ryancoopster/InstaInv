import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { presetBasicUser, presetManager } from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding InstaInv…");

  // ---- Roles / user types -------------------------------------------------
  const adminType = await prisma.userType.upsert({
    where: { name: "Administrator" },
    update: {},
    create: { name: "Administrator", description: "Full access to everything.", isAdmin: true, isSystem: true, sortOrder: 0 },
  });

  const managerType = await prisma.userType.upsert({
    where: { name: "Manager" },
    update: { permissions: presetManager() },
    create: { name: "Manager", description: "Manage inventory, approve orders, design labels.", permissions: presetManager(), isSystem: true, sortOrder: 1 },
  });

  const basicType = await prisma.userType.upsert({
    where: { name: "Inventory Taker" },
    update: { permissions: presetBasicUser() },
    create: { name: "Inventory Taker", description: "Take counts and request items.", permissions: presetBasicUser(), isSystem: true, sortOrder: 2 },
  });

  // ---- Default admin user -------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@instainv.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin1234";
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Admin",
      passwordHash: await bcrypt.hash(adminPassword, 10),
      userTypeId: adminType.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "tech@instainv.local" },
    update: {},
    create: {
      email: "tech@instainv.local",
      name: "Sample Technician",
      passwordHash: await bcrypt.hash("tech1234", 10),
      userTypeId: basicType.id,
    },
  });

  // ---- Suppliers ----------------------------------------------------------
  const mcmaster = await prisma.supplier.upsert({
    where: { name: "McMaster-Carr" },
    update: {},
    create: { name: "McMaster-Carr", website: "https://www.mcmaster.com", sortOrder: 0 },
  });
  const grainger = await prisma.supplier.upsert({
    where: { name: "Grainger" },
    update: {},
    create: { name: "Grainger", website: "https://www.grainger.com", sortOrder: 1 },
  });
  const digikey = await prisma.supplier.upsert({
    where: { name: "Digi-Key" },
    update: {},
    create: { name: "Digi-Key", website: "https://www.digikey.com", sortOrder: 2 },
  });

  // ---- Categories + custom fields ----------------------------------------
  const hardware = await prisma.category.upsert({
    where: { parentId_name: { parentId: null as any, name: "Hardware" } },
    update: {},
    create: { name: "Hardware", color: "#64748b", icon: "Bolt", sortOrder: 0 },
  }).catch(async () => {
    // parentId null unique can vary by DB; fall back to findFirst/create.
    const found = await prisma.category.findFirst({ where: { name: "Hardware", parentId: null } });
    return found ?? prisma.category.create({ data: { name: "Hardware", color: "#64748b", icon: "Bolt", sortOrder: 0 } });
  });

  const electronics = await prisma.category.findFirst({ where: { name: "Electronics", parentId: null } })
    ?? await prisma.category.create({ data: { name: "Electronics", color: "#0ea5e9", icon: "CircuitBoard", sortOrder: 1 } });

  const hardwareFields: { name: string; key: string; type: any; unit?: string; options?: string[]; showOnLabel?: boolean }[] = [
    { name: "Thread Size", key: "thread_size", type: "TEXT", showOnLabel: true },
    { name: "Length", key: "length", type: "NUMBER", unit: "in", showOnLabel: true },
    { name: "Type", key: "type", type: "TEXT", showOnLabel: true },
    { name: "Material", key: "material", type: "SELECT", options: ["Steel", "Stainless", "Brass", "Nylon", "Aluminum"], showOnLabel: true },
    { name: "Coating", key: "coating", type: "SELECT", options: ["None", "Zinc", "Black-Oxide", "Galvanized"], showOnLabel: true },
  ];
  for (let i = 0; i < hardwareFields.length; i++) {
    const f = hardwareFields[i];
    await prisma.customFieldDef.upsert({
      where: { categoryId_key: { categoryId: hardware.id, key: f.key } },
      update: { name: f.name, type: f.type, unit: f.unit, options: f.options ?? [], showOnLabel: f.showOnLabel ?? false, sortOrder: i },
      create: { categoryId: hardware.id, name: f.name, key: f.key, type: f.type, unit: f.unit, options: f.options ?? [], showOnLabel: f.showOnLabel ?? false, sortOrder: i },
    });
  }

  // ---- Box -> Drawers -> Bins --------------------------------------------
  const box = await prisma.box.findFirst({ where: { name: "Hardware Case A" } })
    ?? await prisma.box.create({
      data: { name: "Hardware Case A", description: "Main fastener case.", location: "Shop wall", gridRows: 4, gridCols: 1, sortOrder: 0 },
    });

  const drawerSpecs = [
    { name: "Machine Screws", label: "A1", gridRow: 0 },
    { name: "Nuts & Washers", label: "A2", gridRow: 1 },
    { name: "Standoffs", label: "A3", gridRow: 2 },
    { name: "Misc", label: "A4", gridRow: 3 },
  ];
  const drawers = [];
  for (let i = 0; i < drawerSpecs.length; i++) {
    const s = drawerSpecs[i];
    const d = await prisma.drawer.findFirst({ where: { boxId: box.id, label: s.label } })
      ?? await prisma.drawer.create({
        data: { boxId: box.id, name: s.name, label: s.label, gridRow: s.gridRow, gridCol: 0, binRows: 2, binCols: 4, sortOrder: i },
      });
    drawers.push(d);
  }

  const nutsDrawer = drawers[1];
  // Bins inside the nuts drawer
  const binA = await prisma.bin.findFirst({ where: { drawerId: nutsDrawer.id, name: "Nuts" } })
    ?? await prisma.bin.create({ data: { drawerId: nutsDrawer.id, name: "Nuts", gridRow: 0, gridCol: 0, sortOrder: 0 } });
  await prisma.bin.findFirst({ where: { drawerId: nutsDrawer.id, name: "Washers" } })
    ?? await prisma.bin.create({ data: { drawerId: nutsDrawer.id, name: "Washers", gridRow: 0, gridCol: 1, sortOrder: 1 } });

  // ---- Items (matches the sample label) ----------------------------------
  const existingItem = await prisma.item.findFirst({ where: { partNumber: "90328A103" } });
  if (!existingItem) {
    await prisma.item.create({
      data: {
        name: "Nut with Tooth Lock Washer",
        description: "8-32 nut with external-tooth lock washer.",
        partNumber: "90328A103",
        purchaseCost: "0.12",
        unit: "ea",
        quantity: 240,
        desiredQuantity: 500,
        minQuantity: 100,
        supplierId: mcmaster.id,
        supplierLink: "https://www.mcmaster.com/90328A103/",
        categoryId: hardware.id,
        drawerId: nutsDrawer.id,
        binId: binA.id,
        customValues: { thread_size: "8-32", type: "Nut W/ Tooth Lock Washer", material: "Steel", coating: "Black-Oxide" },
        sortOrder: 0,
      },
    });
  }

  const moreItems = [
    { name: "Socket Head Cap Screw 8-32 x 1/2\"", partNumber: "92196A194", cost: "0.09", qty: 120, desired: 250, drawer: drawers[0], cat: hardware, supplier: mcmaster, cv: { thread_size: "8-32", length: 0.5, type: "Socket Head Cap Screw", material: "Stainless", coating: "None" } },
    { name: "Hex Nut 1/4-20", partNumber: "90480A029", cost: "0.05", qty: 60, desired: 200, drawer: drawers[1], cat: hardware, supplier: mcmaster, cv: { thread_size: "1/4-20", type: "Hex Nut", material: "Steel", coating: "Zinc" } },
    { name: "Aluminum Standoff M3 x 10mm", partNumber: "93655A101", cost: "0.34", qty: 40, desired: 100, drawer: drawers[2], cat: hardware, supplier: grainger, cv: { thread_size: "M3", length: 0.39, type: "Standoff", material: "Aluminum" } },
    { name: "10kΩ Resistor 1/4W", partNumber: "CF14JT10K0", cost: "0.02", qty: 480, desired: 1000, drawer: drawers[3], cat: electronics, supplier: digikey, cv: {} },
  ];
  for (let i = 0; i < moreItems.length; i++) {
    const m = moreItems[i];
    const exists = await prisma.item.findFirst({ where: { partNumber: m.partNumber } });
    if (exists) continue;
    await prisma.item.create({
      data: {
        name: m.name,
        partNumber: m.partNumber,
        purchaseCost: m.cost,
        unit: "ea",
        quantity: m.qty,
        desiredQuantity: m.desired,
        minQuantity: Math.round(m.desired * 0.2),
        supplierId: m.supplier.id,
        categoryId: m.cat.id,
        drawerId: m.drawer.id,
        customValues: m.cv,
        sortOrder: i + 1,
      },
    });
  }

  // ---- Label templates ----------------------------------------------------
  const binLabelExists = await prisma.labelTemplate.findFirst({ where: { name: "Default Bin Label" } });
  if (!binLabelExists) {
    await prisma.labelTemplate.create({
      data: {
        name: "Default Bin Label",
        target: "BIN",
        widthMm: 62,
        heightMm: 29,
        tapeName: "Brother DK-1209 29x62",
        isDefault: true,
        content: {
          dpi: 300,
          background: "#ffffff",
          elements: [
            { id: "qr", type: "qrcode", x: 2, y: 2, w: 25, h: 25, binding: "item.url" },
            { id: "pn", type: "text", x: 2, y: 27, w: 25, h: 5, text: "{{item.partNumber}}", fontSize: 8, align: "center" },
            { id: "thread", type: "text", x: 30, y: 2, w: 30, h: 10, text: "{{item.custom.thread_size}}", fontSize: 22, bold: true, align: "right" },
            { id: "name", type: "text", x: 30, y: 14, w: 30, h: 10, text: "{{item.name}}", fontSize: 9, align: "left" },
            { id: "mat", type: "text", x: 30, y: 24, w: 30, h: 5, text: "{{item.custom.material}} {{item.custom.coating}}", fontSize: 8, align: "left" },
          ],
        },
      },
    });
  }

  const drawerLabelExists = await prisma.labelTemplate.findFirst({ where: { name: "Default Drawer Label" } });
  if (!drawerLabelExists) {
    await prisma.labelTemplate.create({
      data: {
        name: "Default Drawer Label",
        target: "DRAWER",
        widthMm: 90,
        heightMm: 29,
        tapeName: "Brother DK-1201 29x90",
        isDefault: true,
        content: {
          dpi: 300,
          background: "#ffffff",
          elements: [
            { id: "label", type: "text", x: 2, y: 2, w: 20, h: 25, text: "{{drawer.label}}", fontSize: 26, bold: true, align: "center" },
            { id: "name", type: "text", x: 24, y: 4, w: 64, h: 8, text: "{{drawer.name}}", fontSize: 12, bold: true },
            { id: "summary", type: "text", x: 24, y: 14, w: 64, h: 13, text: "{{drawer.summary}}", fontSize: 7 },
          ],
        },
      },
    });
  }

  const itemLabelExists = await prisma.labelTemplate.findFirst({ where: { name: "Default Item Label" } });
  if (!itemLabelExists) {
    await prisma.labelTemplate.create({
      data: {
        name: "Default Item Label",
        target: "ITEM",
        widthMm: 62,
        heightMm: 29,
        tapeName: "Brother DK-1209 29x62",
        isDefault: true,
        content: {
          dpi: 300,
          background: "#ffffff",
          elements: [
            { id: "qr", type: "qrcode", x: 2, y: 2, w: 25, h: 25, binding: "item.url" },
            { id: "pn", type: "text", x: 2, y: 27, w: 25, h: 5, text: "{{item.partNumber}}", fontSize: 7, align: "center" },
            { id: "name", type: "text", x: 30, y: 2, w: 30, h: 12, text: "{{item.name}}", fontSize: 10, bold: true, align: "left" },
            { id: "detail", type: "text", x: 30, y: 15, w: 30, h: 6, text: "{{item.custom.thread_size}} {{item.custom.length}}", fontSize: 8, align: "left" },
            { id: "loc", type: "text", x: 30, y: 22, w: 30, h: 5, text: "{{box.name}} {{drawer.label}}", fontSize: 7, align: "left" },
          ],
        },
      },
    });
  }

  console.log(`Done. Admin login: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
