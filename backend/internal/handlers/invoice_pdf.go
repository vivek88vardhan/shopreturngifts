package handlers

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"

	"shopreturngifts-api/internal/models"
)

const (
	invoiceMarginL = 15.0
	invoiceMarginR = 15.0
	invoiceMarginT = 14.0
	invoiceMarginB = 18.0
)

func invoiceContentWidth(pdf *fpdf.Fpdf) float64 {
	w, _ := pdf.GetPageSize()
	return w - invoiceMarginL - invoiceMarginR
}

func fetchInvoiceLogo(logoURL string) ([]byte, string, error) {
	logoURL = strings.TrimSpace(logoURL)
	if logoURL == "" {
		return nil, "", nil
	}

	if strings.HasPrefix(logoURL, "data:") {
		comma := strings.Index(logoURL, ",")
		if comma < 0 {
			return nil, "", fmt.Errorf("invalid data URL logo")
		}
		meta := logoURL[:comma]
		raw := logoURL[comma+1:]
		imgType := "PNG"
		if strings.Contains(meta, "image/jpeg") || strings.Contains(meta, "image/jpg") {
			imgType = "JPG"
		}
		data, err := base64.StdEncoding.DecodeString(raw)
		if err != nil {
			return nil, "", err
		}
		return data, imgType, nil
	}

	req, err := http.NewRequest(http.MethodGet, logoURL, nil)
	if err != nil {
		return nil, "", err
	}
	client := &http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("logo fetch status %d", resp.StatusCode)
	}
	const maxLogoBytes = 4 << 20
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxLogoBytes))
	if err != nil {
		return nil, "", err
	}
	if len(data) == 0 {
		return nil, "", fmt.Errorf("empty logo response")
	}

	imgType := detectInvoiceImageType(data, resp.Header.Get("Content-Type"), logoURL)
	if imgType == "" {
		return nil, "", fmt.Errorf("unsupported logo image format")
	}
	return data, imgType, nil
}

func detectInvoiceImageType(data []byte, contentType, url string) string {
	ct := strings.ToLower(contentType)
	if strings.Contains(ct, "png") {
		return "PNG"
	}
	if strings.Contains(ct, "jpeg") || strings.Contains(ct, "jpg") {
		return "JPG"
	}
	if len(data) >= 8 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
		return "PNG"
	}
	if len(data) >= 2 && data[0] == 0xFF && data[1] == 0xD8 {
		return "JPG"
	}
	lower := strings.ToLower(url)
	if strings.HasSuffix(lower, ".png") {
		return "PNG"
	}
	if strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg") {
		return "JPG"
	}
	return ""
}

func registerInvoiceLogo(pdf *fpdf.Fpdf, data []byte, imgType string) (maxW, maxH float64, ok bool) {
	if len(data) == 0 || imgType == "" {
		return 0, 0, false
	}
	opt := fpdf.ImageOptions{ImageType: imgType, ReadDpi: true}
	info := pdf.RegisterImageOptionsReader("invoice-logo", opt, bytes.NewReader(data))
	if pdf.Err() {
		pdf.SetError(nil)
		return 0, 0, false
	}
	w := info.Width()
	h := info.Height()
	if w <= 0 || h <= 0 {
		return 0, 0, false
	}
	const targetW = 42.0
	const targetH = 18.0
	scale := targetW / w
	if targetH/h < scale {
		scale = targetH / h
	}
	if scale > 1 {
		scale = 1
	}
	return w * scale, h * scale, true
}

func drawInvoiceHeader(pdf *fpdf.Fpdf, storeName string, order *models.Order, logoW, logoH float64, hasLogo bool) float64 {
	pageW, _ := pdf.GetPageSize()
	contentW := invoiceContentWidth(pdf)
	y := invoiceMarginT

	metaW := 58.0
	metaX := pageW - invoiceMarginR - metaW

	if hasLogo {
		logoX := invoiceMarginL + (contentW-logoW)/2
		pdf.ImageOptions("invoice-logo", logoX, y, logoW, logoH, false, fpdf.ImageOptions{ReadDpi: true}, 0, "")
		y += logoH + 3
	}

	pdf.SetFont("Arial", "B", 17)
	pdf.SetXY(invoiceMarginL, y)
	pdf.CellFormat(contentW, 9, storeName, "", 1, "C", false, 0, "")
	y += 9

	pdf.SetFont("Arial", "", 12)
	pdf.SetTextColor(80, 80, 80)
	pdf.SetXY(invoiceMarginL, y)
	pdf.CellFormat(contentW, 7, "INVOICE", "", 1, "C", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
	y += 8

	// Meta block top-right (aligned with header area)
	metaY := invoiceMarginT
	pdf.SetFont("Arial", "", 9)
	pdf.SetTextColor(100, 100, 100)
	pdf.SetXY(metaX, metaY)
	pdf.CellFormat(metaW, 4.5, "Invoice date", "", 1, "R", false, 0, "")
	pdf.SetFont("Arial", "", 10)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(metaX, metaY+4.5)
	pdf.CellFormat(metaW, 5, formatPaidAtForInvoice(order.PaidAt), "", 1, "R", false, 0, "")

	pdf.SetFont("Arial", "", 9)
	pdf.SetTextColor(100, 100, 100)
	pdf.SetXY(metaX, metaY+11)
	pdf.CellFormat(metaW, 4.5, "Order number", "", 1, "R", false, 0, "")
	pdf.SetFont("Arial", "B", 10)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(metaX, metaY+15.5)
	pdf.CellFormat(metaW, 5, order.OrderNumber, "", 1, "R", false, 0, "")

	if y < metaY+22 {
		y = metaY + 22
	}

	// Divider under header
	pdf.SetDrawColor(200, 200, 200)
	pdf.SetLineWidth(0.3)
	pdf.Line(invoiceMarginL, y, pageW-invoiceMarginR, y)
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetY(y + 5)

	return pdf.GetY()
}

const invoiceAddressLineH = 5.5

// writeInvoiceAddressColumn draws stacked lines at a fixed X. ln=1 must not be used
// here — it resets X to the left margin and causes Bill To / Ship To overlap.
func writeInvoiceAddressColumn(pdf *fpdf.Fpdf, x, y, w float64, lines []string) float64 {
	curY := y
	pdf.SetFont("Arial", "", 10)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		pdf.SetXY(x, curY)
		pdf.CellFormat(w, invoiceAddressLineH, line, "", 0, "L", false, 0, "")
		curY += invoiceAddressLineH
	}
	if curY == y {
		return y
	}
	return curY
}

func addressLinesForInvoice(addr models.Address) []string {
	var lines []string
	if s := strings.TrimSpace(addr.Line1); s != "" {
		lines = append(lines, s)
	}
	if s := strings.TrimSpace(addr.Line2); s != "" {
		lines = append(lines, s)
	}
	city := strings.TrimSpace(addr.City)
	state := strings.TrimSpace(addr.State)
	zip := strings.TrimSpace(addr.Zip)
	if city != "" || state != "" || zip != "" {
		lines = append(lines, fmt.Sprintf("%s, %s %s", city, state, zip))
	}
	if s := strings.TrimSpace(addr.Country); s != "" {
		lines = append(lines, s)
	}
	return lines
}

func orderMerchandiseSubtotal(order *models.Order) float64 {
	if order == nil {
		return 0
	}
	var sum float64
	for _, item := range order.Items {
		sum += item.LineTotal
	}
	return sum
}

func drawBillShipColumns(pdf *fpdf.Fpdf, customerName, customerEmail string, billAddr, shipAddr models.Address) {
	contentW := invoiceContentWidth(pdf)
	startY := pdf.GetY()
	mid := invoiceMarginL + contentW/2
	gutter := 4.0
	lineX := mid - gutter/2
	leftW := contentW/2 - gutter
	rightX := mid + gutter/2
	rightW := leftW

	pdf.SetFont("Arial", "B", 11)
	pdf.SetXY(invoiceMarginL, startY)
	pdf.CellFormat(leftW, 6, "Bill To", "", 0, "L", false, 0, "")
	pdf.SetXY(rightX, startY)
	pdf.CellFormat(rightW, 6, "Ship To", "", 0, "L", false, 0, "")

	bodyY := startY + 7
	billLines := []string{customerName, customerEmail}
	billLines = append(billLines, addressLinesForInvoice(billAddr)...)
	shipLines := []string{customerName}
	shipLines = append(shipLines, addressLinesForInvoice(shipAddr)...)

	billEnd := writeInvoiceAddressColumn(pdf, invoiceMarginL, bodyY, leftW, billLines)
	shipEnd := writeInvoiceAddressColumn(pdf, rightX, bodyY, rightW, shipLines)
	endY := billEnd
	if shipEnd > endY {
		endY = shipEnd
	}

	pdf.SetDrawColor(210, 210, 210)
	pdf.SetLineWidth(0.25)
	pdf.Line(lineX, startY-1, lineX, endY+1)
	pdf.SetDrawColor(0, 0, 0)

	pdf.SetY(endY + 6)
}

func drawInvoiceItemsTable(pdf *fpdf.Fpdf, order *models.Order) {
	contentW := invoiceContentWidth(pdf)
	colItem := contentW * 0.52
	colQty := 18.0
	colUnit := 32.0
	colLine := contentW - colItem - colQty - colUnit

	pdf.SetFillColor(245, 245, 245)
	pdf.SetFont("Arial", "B", 10)
	pdf.CellFormat(colItem, 8, "Item", "1", 0, "L", true, 0, "")
	pdf.CellFormat(colQty, 8, "Qty", "1", 0, "C", true, 0, "")
	pdf.CellFormat(colUnit, 8, "Unit price", "1", 0, "R", true, 0, "")
	pdf.CellFormat(colLine, 8, "Line total", "1", 1, "R", true, 0, "")
	pdf.SetFont("Arial", "", 10)

	for i, item := range order.Items {
		fill := i%2 == 1
		if fill {
			pdf.SetFillColor(252, 252, 252)
		} else {
			pdf.SetFillColor(255, 255, 255)
		}
		name := item.Name
		if len(name) > 72 {
			name = name[:69] + "..."
		}
		pdf.CellFormat(colItem, 7.5, name, "1", 0, "L", fill, 0, "")
		pdf.CellFormat(colQty, 7.5, fmt.Sprintf("%d", item.Qty), "1", 0, "C", fill, 0, "")
		pdf.CellFormat(colUnit, 7.5, formatMoney(order.Currency, item.UnitPrice), "1", 0, "R", fill, 0, "")
		pdf.CellFormat(colLine, 7.5, formatMoney(order.Currency, item.LineTotal), "1", 1, "R", fill, 0, "")
	}
	pdf.SetFillColor(255, 255, 255)
	pdf.Ln(3)
}

func invoiceCouponLabel(code string) string {
	code = strings.TrimSpace(strings.ToUpper(code))
	if code != "" {
		return fmt.Sprintf("Coupon applied (%s)", code)
	}
	return "Coupon applied"
}

func drawInvoiceTotals(pdf *fpdf.Fpdf, order *models.Order, couponCode string, couponDiscount float64) {
	contentW := invoiceContentWidth(pdf)
	labelW := contentW - 38
	valW := 38.0

	writeTotalRow := func(label, value string, bold bool) {
		if bold {
			pdf.SetFont("Arial", "B", 11)
		} else {
			pdf.SetFont("Arial", "", 10)
		}
		pdf.CellFormat(labelW, 7, label, "", 0, "R", false, 0, "")
		pdf.CellFormat(valW, 7, value, "", 1, "R", false, 0, "")
	}

	merchSubtotal := orderMerchandiseSubtotal(order)
	displaySubtotal := merchSubtotal
	if displaySubtotal <= 0 && order.Subtotal > 0 {
		displaySubtotal = order.Subtotal
	}
	writeTotalRow("Subtotal", formatMoney(order.Currency, displaySubtotal), false)
	if couponDiscount <= 0.005 {
		couponDiscount = displaySubtotal - order.Subtotal
	}
	if couponDiscount > 0.005 {
		writeTotalRow(invoiceCouponLabel(couponCode), "-"+formatMoney(order.Currency, couponDiscount), false)
	}
	if order.RewardDiscountCents > 0 {
		writeTotalRow("Rewards", "-"+formatMoney(order.Currency, float64(order.RewardDiscountCents)/100), false)
	}
	deliveryLabel := "Delivery"
	deliveryValue := formatMoney(order.Currency, order.ShippingFee)
	if order.ShippingFee <= 0.005 {
		deliveryValue = "Free"
	}
	writeTotalRow(deliveryLabel, deliveryValue, false)
	writeTotalRow("Tax", formatMoney(order.Currency, order.Tax), false)
	pdf.Ln(1)
	pdf.SetDrawColor(180, 180, 180)
	lineY := pdf.GetY()
	x1 := invoiceMarginL + labelW
	x2 := invoiceMarginL + labelW + valW
	pdf.Line(x1, lineY, x2, lineY)
	pdf.Ln(2)
	writeTotalRow("Total paid", formatMoney(order.Currency, order.Total), true)
}

func renderInvoicePDF(config *models.StoreConfig, user *models.User, order *models.Order, couponCode string, couponDiscount float64) ([]byte, error) {
	storeName := "ShopReturnGifts"
	if config != nil && strings.TrimSpace(config.StoreName) != "" {
		storeName = strings.TrimSpace(config.StoreName)
	}

	customerName := strings.TrimSpace(order.UserName)
	customerEmail := strings.TrimSpace(order.UserEmail)
	if user != nil {
		if customerName == "" {
			customerName = strings.TrimSpace(user.Name)
		}
		if customerEmail == "" {
			customerEmail = strings.TrimSpace(user.Email)
		}
	}
	if customerName == "" {
		customerName = "Customer"
	}
	if customerEmail == "" {
		customerEmail = "Not available"
	}

	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(invoiceMarginL, invoiceMarginT, invoiceMarginR)
	pdf.SetAutoPageBreak(true, invoiceMarginB)

	year := time.Now().Year()
	copyrightLine := fmt.Sprintf("Copyright %d %s. All rights reserved.", year, storeName)
	pdf.SetFooterFunc(func() {
		pageW, pageH := pdf.GetPageSize()
		pdf.SetY(-12)
		pdf.SetDrawColor(210, 210, 210)
		pdf.SetLineWidth(0.25)
		pdf.Line(invoiceMarginL, pageH-14, pageW-invoiceMarginR, pageH-14)
		pdf.SetDrawColor(0, 0, 0)
		pdf.SetFont("Arial", "", 8)
		pdf.SetTextColor(110, 110, 110)
		pdf.CellFormat(0, 4, copyrightLine, "", 0, "C", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})

	pdf.AddPage()

	logoW, logoH := 0.0, 0.0
	hasLogo := false
	if config != nil && strings.TrimSpace(config.LogoURL) != "" {
		data, imgType, err := fetchInvoiceLogo(config.LogoURL)
		if err != nil {
			log.Printf("invoice logo fetch skipped: %v", err)
		} else if len(data) > 0 {
			logoW, logoH, hasLogo = registerInvoiceLogo(pdf, data, imgType)
		}
	}

	billAddr := order.ShippingAddress
	if user != nil && strings.TrimSpace(user.Address.Line1) != "" {
		billAddr = user.Address
	}

	drawInvoiceHeader(pdf, storeName, order, logoW, logoH, hasLogo)
	drawBillShipColumns(pdf, customerName, customerEmail, billAddr, order.ShippingAddress)
	drawInvoiceItemsTable(pdf, order)
	drawInvoiceTotals(pdf, order, couponCode, couponDiscount)

	var out bytes.Buffer
	if err := pdf.Output(&out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
