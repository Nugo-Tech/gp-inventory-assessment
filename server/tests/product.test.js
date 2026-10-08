const mongoose = require("mongoose")
const request = require("supertest")
const { MongoMemoryServer } = require("mongodb-memory-server")
const app = require("../src/app")
const Product = require("../src/models/product")

let mongoServer

const createProduct = (overrides = {}) =>
  Product.create({
    sku: "BAT-48V-100",
    productName: "48V Lithium Battery",
    category: "Batteries",
    stock: 10,
    minStock: 4,
    ...overrides,
  })

const patchStock = (sku, body) =>
  request(app).patch(`/product/${sku}/stock`).send(body)

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create()
  await mongoose.connect(mongoServer.getUri())
})

afterEach(async () => {
  await Product.deleteMany({})
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

describe("GET /products", () => {
  it("returns non-deleted products sorted by SKU", async () => {
    await createProduct({ sku: "PV-550W-001" })
    await createProduct({ sku: "INV-5K-001" })
    await createProduct({ sku: "OLD-001", deleted: true })

    const response = await request(app).get("/products")

    expect(response.status).toBe(200)
    expect(response.body.map((product) => product.sku)).toEqual([
      "INV-5K-001",
      "PV-550W-001",
    ])
  })
})

describe("PATCH /product/:sku/stock", () => {
  describe("successful adjustments", () => {
    it("adds stock for a positive change", async () => {
      await createProduct({ stock: 10 })

      const response = await patchStock("BAT-48V-100", {
        change: 5,
        reason: "Goods received",
      })

      expect(response.status).toBe(200)
      expect(response.body.stock).toBe(15)
    })

    it("removes stock for a negative change", async () => {
      await createProduct({ stock: 10 })

      const response = await patchStock("BAT-48V-100", {
        change: -4,
        reason: "Customer order",
      })

      expect(response.status).toBe(200)
      expect(response.body.stock).toBe(6)
    })

    it("allows removing exactly the available stock", async () => {
      await createProduct({ stock: 3 })

      const response = await patchStock("BAT-48V-100", {
        change: -3,
        reason: "Customer order",
      })

      expect(response.status).toBe(200)
      expect(response.body.stock).toBe(0)
    })

    it("saves an adjustment record with change, trimmed reason and time", async () => {
      await createProduct({ stock: 10 })
      const before = Date.now()

      const response = await patchStock("BAT-48V-100", {
        change: -2,
        reason: "  Customer order  ",
      })

      expect(response.status).toBe(200)
      expect(response.body.stockAdjustments).toHaveLength(1)

      const saved = await Product.findOne({ sku: "BAT-48V-100" })
      const [adjustment] = saved.stockAdjustments
      expect(adjustment.change).toBe(-2)
      expect(adjustment.reason).toBe("Customer order")
      expect(adjustment.adjustedAt.getTime()).toBeGreaterThanOrEqual(before)
      expect(saved.stock).toBe(8)
    })

    it("returns the full updated product", async () => {
      await createProduct()

      const response = await patchStock("BAT-48V-100", {
        change: 1,
        reason: "Goods received",
      })

      expect(response.body).toMatchObject({
        sku: "BAT-48V-100",
        productName: "48V Lithium Battery",
        category: "Batteries",
        stock: 11,
      })
    })
  })

  describe("validation", () => {
    it.each([
      ["zero", 0],
      ["a decimal", 1.5],
      ["a numeric string", "5"],
      ["null", null],
      ["missing", undefined],
      ["larger than a safe integer", 1e300],
      ["negative and larger than a safe integer", -1e300],
    ])("returns 400 when change is %s", async (_label, change) => {
      await createProduct({ stock: 10 })

      const response = await patchStock("BAT-48V-100", {
        change,
        reason: "Goods received",
      })

      expect(response.status).toBe(400)
      expect(response.body.message).toBe("Change must be a non-zero integer")
    })

    it.each([
      ["missing", undefined],
      ["empty", ""],
      ["whitespace only", "   "],
      ["not a string", 123],
    ])("returns 400 when reason is %s", async (_label, reason) => {
      await createProduct({ stock: 10 })

      const response = await patchStock("BAT-48V-100", { change: 1, reason })

      expect(response.status).toBe(400)
      expect(response.body.message).toBe("Reason is required")
    })

    it("returns 400 for a malformed JSON body", async () => {
      await createProduct({ stock: 10 })

      const response = await request(app)
        .patch("/product/BAT-48V-100/stock")
        .set("Content-Type", "application/json")
        .send("{bad json")

      expect(response.status).toBe(400)
      expect(response.body.message).toBe("Request body must be valid JSON")
    })

    it("does not modify the product when validation fails", async () => {
      await createProduct({ stock: 10 })

      await patchStock("BAT-48V-100", { change: 0, reason: "x" })
      await patchStock("BAT-48V-100", { change: 1, reason: " " })

      const saved = await Product.findOne({ sku: "BAT-48V-100" })
      expect(saved.stock).toBe(10)
      expect(saved.stockAdjustments).toHaveLength(0)
    })
  })

  describe("not found", () => {
    it("returns 404 when the SKU does not exist", async () => {
      const response = await patchStock("UNKNOWN-SKU", {
        change: 1,
        reason: "Goods received",
      })

      expect(response.status).toBe(404)
      expect(response.body.message).toMatch(/not found/i)
    })

    it("returns 404 for a deleted product", async () => {
      await createProduct({ deleted: true })

      const response = await patchStock("BAT-48V-100", {
        change: 1,
        reason: "Goods received",
      })

      expect(response.status).toBe(404)
    })
  })

  describe("insufficient stock", () => {
    it("returns 409 when removing more than the available stock", async () => {
      await createProduct({ stock: 3 })

      const response = await patchStock("BAT-48V-100", {
        change: -4,
        reason: "Customer order",
      })

      expect(response.status).toBe(409)
      expect(response.body.message).toMatch(/insufficient stock/i)
    })

    it("leaves stock and history unchanged after a 409", async () => {
      await createProduct({ stock: 3 })

      await patchStock("BAT-48V-100", { change: -4, reason: "Customer order" })

      const saved = await Product.findOne({ sku: "BAT-48V-100" })
      expect(saved.stock).toBe(3)
      expect(saved.stockAdjustments).toHaveLength(0)
    })

    it("never goes negative under concurrent removals", async () => {
      await createProduct({ stock: 5 })

      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          patchStock("BAT-48V-100", { change: -1, reason: "Concurrent order" }),
        ),
      )

      const statuses = responses.map((response) => response.status)
      expect(statuses.filter((status) => status === 200)).toHaveLength(5)
      expect(statuses.filter((status) => status === 409)).toHaveLength(15)

      const saved = await Product.findOne({ sku: "BAT-48V-100" })
      expect(saved.stock).toBe(0)
      expect(saved.stockAdjustments).toHaveLength(5)
    })
  })
})
