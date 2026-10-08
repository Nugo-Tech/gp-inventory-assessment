import axios from "axios"

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5050"

export const loadProducts = () => async (dispatch) => {
  dispatch({ type: "SET_PRODUCT_LOADING", data: true })
  dispatch({ type: "SET_PRODUCT_ERROR", data: "" })

  try {
    const response = await axios.get(`${apiUrl}/products`)
    dispatch({ type: "SET_PRODUCTS", data: response.data })
  } catch (error) {
    dispatch({
      type: "SET_PRODUCT_ERROR",
      data: error.response?.data?.message || "Could not load products",
    })
  } finally {
    dispatch({ type: "SET_PRODUCT_LOADING", data: false })
  }
}

export const adjustStock =
  ({ sku, change, reason }) =>
  async (dispatch) => {
    dispatch({ type: "SET_PRODUCT_LOADING", data: true })
    dispatch({ type: "SET_PRODUCT_ERROR", data: "" })

    try {
      const response = await axios.patch(
        `${apiUrl}/product/${encodeURIComponent(sku)}/stock`,
        { change, reason },
      )
      dispatch({ type: "ADJUST_STOCK_SUCCESS", data: response.data })
      return true
    } catch (error) {
      dispatch({
        type: "SET_PRODUCT_ERROR",
        data: error.response?.data?.message || "Could not update stock",
      })
      return false
    } finally {
      dispatch({ type: "SET_PRODUCT_LOADING", data: false })
    }
  }
