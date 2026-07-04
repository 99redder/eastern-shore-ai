// ===== API URL Constants =====
    const CONTACT_API_URL = window.CONTACT_API_URL || 'https://eastern-shore-ai-contact.99redder.workers.dev/api/contact';
    const BOOKINGS_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/bookings');
    const BLOCK_SLOT_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/admin/block-slot');
    const BLOCK_DAY_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/admin/block-day');
    const CLEANUP_PENDING_BOOKINGS_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/admin/bookings/cleanup-pending');
    const TAX_TX_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/tax/transactions');
    const TAX_EXPENSE_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/tax/expense');
    const TAX_INCOME_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/tax/income');
    const TAX_OWNER_TRANSFER_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/tax/owner-transfer');
    const TAX_EXPENSE_UPDATE_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/tax/expense/update');
    const TAX_INCOME_UPDATE_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/tax/income/update');
    const TAX_EXPENSE_DELETE_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/tax/expense/delete');
    const TAX_INCOME_DELETE_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/tax/income/delete');
    const TAX_EXPORT_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/tax/export.csv');
    const TAX_RECEIPT_UPLOAD_URL = CONTACT_API_URL.replace('/api/contact', '/api/tax/receipt/upload');
    const TAX_RECEIPT_URL = CONTACT_API_URL.replace('/api/contact', '/api/tax/receipt');
    const ACCOUNTS_LIST_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/list');
    const ACCOUNTS_SUMMARY_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/summary');
    const ACCOUNTS_JOURNAL_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/journal');
    const ACCOUNTS_STATEMENTS_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/statements');
    const ACCOUNTS_YEAR_CLOSE_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/year-close');
    const ACCOUNTS_REBUILD_AUTO_JOURNAL_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/rebuild-auto-journal');
    const INVOICES_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/invoices');
    const ORDERS_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/orders');
    const ORDER_PREVIEW_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/orders/preview');
    const ORDER_SEND_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/orders/send');
    const ORDER_TRACKING_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/orders/tracking');
    const ORDER_MANUAL_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/orders/manual');
    const ORDER_DELETE_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/orders/delete');
    const ORDER_BATTERY_TEST_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/orders/battery-test');
    const INVOICE_STATUS_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/invoices/status');
    const INVOICE_PAYMENT_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/invoices/payment');
    const INVOICE_PAYMENT_LINK_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/invoices/payment-link');
    const INVOICE_SEND_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/invoices/send');
    const INVOICE_DELETE_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/invoices/delete');
    const INVOICE_DETAIL_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/invoices/detail');
    const INVOICE_UPDATE_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/invoices/update');
    const QUOTES_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/quotes');
    const QUOTE_DETAIL_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/quotes/detail');
    const QUOTE_UPDATE_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/quotes/update');
    const QUOTE_DELETE_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/quotes/delete');
    const QUOTE_SEND_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/quotes/send');
    const QUOTE_CONVERT_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/accounts/quotes/convert');

    // ===== DOM Refs =====
    let adminLock;
    let adminControls;
    let adminHeaderTools;
    let adminKeyEl;
    let adminUnlockBtn;

    let adminSectionTabsEl;
    let adminSectionTabBtns;
    let bookingCollapseBtn;
    let bookingControlsBody;
    let taxCollapseBtn;
    let taxLedgerBody;
    let ordersCollapseBtn;
    let ordersBody;
    let accountsCollapseBtn;
    let accountsBody;
    let reconciliationCollapseBtn;
    let reconciliationBody;
    let invoicesCollapseBtn;
    let invoicesBody;
    let yearCloseCollapseBtn;
    let yearCloseBody;
    let auditPackageCollapseBtn;
    let auditPackageBody;

    let taxYearEl;
    let taxSummaryYearEl;
    let taxTypeEl;
    let taxRefreshBtn;
    let taxExportBtn;
    let taxModeExpenseBtn;
    let taxModeIncomeBtn;
    let taxModeOwnerTransferBtn;
    let taxManageCategoriesBtn;
    let adminUserGuideBtn;
    let adminBlurAmountsBtn;
    let adminUserGuideTopBtn;
    let taxExpensePanel;
    let taxOwnerTransferPanel;
    let taxIncomePanel;
    let taxExpenseFields;
    let taxOwnerTransferFields;
    let taxIncomeFields;
    let taxMinimizeExpenseBtn;
    let taxMinimizeOwnerTransferBtn;
    let taxMinimizeIncomeBtn;
    let taxCategoryModal;
    let taxCategoryCloseBtn;
    let taxCategoryXBtn;
    let expenseCategoriesListEl;
    let incomeCategoriesListEl;
    let newExpenseCategoryEl;
    let newIncomeCategoryEl;
    let addExpenseCategoryBtn;
    let addIncomeCategoryBtn;
    let taxCategoryEditModal;
    let ownerTransferModal;
    let ownerTransferCloseBtn;
    let yearCloseModal;
    let yearCloseStepsEl;
    let yearCloseCancelBtn;
    let yearCloseApplyBtn;

    let auditPackageModal;
    let auditYearEl;
    let auditSelectAllBtn;
    let auditCancelBtn;
    let auditGenerateBtn;

    let userGuideModal;
    let userGuideCloseBtn;
    let userGuideTabBtns;
    let userGuidePanels;
    let taxCategoryEditInput;
    let taxCategoryEditSaveBtn;
    let taxCategoryEditCancelBtn;
    let taxSummaryListEl;
    let taxListEl;
    let txCategoryFilterEl;
    let txFilterBtns;
    let accountsTabBalancesBtn;
    let accountsTabBalanceSheetBtn;
    let accountsTabPnlBtn;
    let accountsTabCashflowBtn;
    let accountsTabJournalBtn;
    let accountsYearEl;
    let accountsFromEl;
    let accountsToEl;
    let accountsRefreshBtn;
    let accountsRebuildAutoJournalBtn;
    let orderFilterEl;
    let orderRefreshBtn;
    let orderListEl;
    let orderAddManualBtn;
    let manualOrderModal;
    let manualOrderCustomerNameEl;
    let manualOrderCustomerEmailEl;
    let manualOrderCustomerPhoneEl;
    let manualOrderPaymentMethodEl;
    let manualOrderPaymentDateEl;
    let manualOrderAmountEl;
    let manualOrderSummaryEl;
    let manualOrderNotesEl;
    let manualOrderCancelBtn;
    let manualOrderSaveBtn;
    let trackingModal;
    let trackingTitleEl;
    let trackingProviderEl;
    let trackingNumberEl;
    let trackingUrlEl;
    let trackingCancelBtn;
    let trackingSaveBtn;
    let orderEmailModal;
    let orderEmailTitleEl;
    let orderEmailSubjectEl;
    let orderEmailBodyEl;
    let orderEmailPreviewEl;
    let orderEmailTrackingWrapEl;
    let orderEmailTrackingNumberEl;
    let orderEmailTrackingUrlEl;
    let orderEmailCancelBtn;
    let orderEmailSendBtn;
    let reconYearEl;
    let reconMonthEl;
    let reconCsvEl;
    let reconRunBtn;
    let reconSummaryEl;
    let invoiceModeViewBtn;
    let invoiceModeAddBtn;
    let invoiceFabBtn;
    let invoiceCreateModal;
    let invoiceCreateTitleEl;
    let invoiceCreateCancelBtn;
    let invoiceCustomerNameEl;
    let invoiceCustomerEmailEl;
    let invoiceCustomerPhoneEl;
    let invoiceDueDateEl;
    let invoiceDescriptionEl;
    let invoiceLineItemsEl;
    let invoiceAddLineItemBtn;
    let invoiceTotalDisplayEl;
    let invoiceCreateBtn;
    let invoiceFilterEl;
    let invoiceSortEl;
    let invoiceRefreshBtn;
    let invoiceListEl;
    let invoicePaymentModal;
    let invoicePaymentAmountEl;
    let invoicePaymentCancelBtn;
    let invoicePaymentSaveBtn;
    let reconMatchesEl;

    // Quotes DOM refs
    let quotesCollapseBtn;
    let quotesBody;
    let quoteModeViewBtn;
    let quoteModeAddBtn;
    let quoteFabBtn;
    let quoteCreateModal;
    let quoteCreateTitleEl;
    let quoteCreateCancelBtn;
    let quoteCustomerNameEl;
    let quoteCustomerEmailEl;
    let quoteCustomerPhoneEl;
    let quoteValidUntilEl;
    let quoteDescriptionEl;
    let quoteLineItemsEl;
    let quoteAddLineItemBtn;
    let quoteTotalDisplayEl;
    let quoteCreateBtn;
    let quoteFilterEl;
    let quoteSortEl;
    let quoteRefreshBtn;
    let quoteListEl;

    let accountsYearCloseBtn;
    let auditPackageBtn;
    let accountsBalanceStatusEl;
    let accountsListEl;
    let accountsStatementsListEl;
    let accountsJournalListEl;

    let taxExpenseDateEl;
    let taxExpenseVendorEl;
    let taxExpenseCategoryEl;
    let taxExpenseAmountEl;
    let taxExpensePaidViaEl;
    let taxExpenseFundingSourceEl;
    let taxExpenseNotesEl;
    let taxAddExpenseBtn;
    let taxUpdateExpenseBtn;
    let taxCancelExpenseEditBtn;
    let taxClearExpenseBtn;

    let taxOwnerTransferDateEl;
    let taxOwnerTransferTypeEl;
    let taxOwnerTransferAmountEl;
    let taxOwnerTransferNotesEl;
    let taxAddOwnerTransferBtn;
    let taxClearOwnerTransferBtn;

    let taxIncomeDateEl;
    let taxIncomeSourceEl;
    let taxIncomeCategoryEl;
    let taxIncomeAmountEl;
    let taxIncomeStripeEl;
    let taxIncomeNotesEl;
    let taxIncomeOwnerFundedEl;
    let taxAddIncomeBtn;
    let taxUpdateIncomeBtn;
    let taxCancelIncomeEditBtn;
    let taxClearIncomeBtn;

    let adminDateEl;
    let adminTimeEl;
    let adminReasonEl;
    let adminListEl;
    let adminCalendarGridEl;
    let adminCalendarTitleEl;
    let adminCalPrevBtn;
    let adminCalNextBtn;
    let adminBlockBtn;
    let adminUnblockBtn;
    let adminBlockDayBtn;
    let adminUnblockDayBtn;
    let adminRefreshBtn;
    let adminCleanupPendingBtn;

    let successModal;
    let successTitle;
    let successDetails;
    let successCloseBtn;
    let errorModal;
    let errorDetails;
    let errorCloseBtn;
    let confirmModal;
    let confirmDetails;
    let confirmOkBtn;
    let confirmCancelBtn;


    function refreshDomRefs() {
      adminLock = document.getElementById('admin-lock');
      adminControls = document.getElementById('admin-controls');
      adminHeaderTools = document.getElementById('admin-header-tools');
      adminKeyEl = document.getElementById('admin-key');
      adminUnlockBtn = document.getElementById('admin-unlock-btn');
      adminSectionTabsEl = document.getElementById('admin-section-tabs');
      adminSectionTabBtns = document.querySelectorAll('[data-admin-tab]');
      bookingCollapseBtn = document.getElementById('booking-collapse-btn');
      bookingControlsBody = document.getElementById('booking-controls-body');
      taxCollapseBtn = document.getElementById('tax-collapse-btn');
      taxLedgerBody = document.getElementById('tax-ledger-body');
      ordersCollapseBtn = document.getElementById('orders-collapse-btn');
      ordersBody = document.getElementById('orders-body');
      accountsCollapseBtn = document.getElementById('accounts-collapse-btn');
      accountsBody = document.getElementById('accounts-body');
      reconciliationCollapseBtn = document.getElementById('reconciliation-collapse-btn');
      reconciliationBody = document.getElementById('reconciliation-body');
      invoicesCollapseBtn = document.getElementById('invoices-collapse-btn');
      invoicesBody = document.getElementById('invoices-body');
      yearCloseCollapseBtn = document.getElementById('year-close-collapse-btn');
      yearCloseBody = document.getElementById('year-close-body');
      auditPackageCollapseBtn = document.getElementById('audit-package-collapse-btn');
      auditPackageBody = document.getElementById('audit-package-body');
      taxYearEl = document.getElementById('tax-year');
      taxSummaryYearEl = document.getElementById('tax-summary-year');
      taxTypeEl = document.getElementById('tax-type');
      taxRefreshBtn = document.getElementById('tax-refresh-btn');
      taxExportBtn = document.getElementById('tax-export-btn');
      taxModeExpenseBtn = document.getElementById('tax-mode-expense-btn');
      taxModeIncomeBtn = document.getElementById('tax-mode-income-btn');
      taxModeOwnerTransferBtn = document.getElementById('tax-mode-owner-transfer-btn');
      taxManageCategoriesBtn = document.getElementById('tax-manage-categories-btn');
      adminUserGuideBtn = document.getElementById('admin-user-guide-btn');
      adminBlurAmountsBtn = document.getElementById('admin-blur-amounts-btn');
      adminUserGuideTopBtn = document.getElementById('admin-user-guide-top-btn');
      taxExpensePanel = document.getElementById('tax-expense-panel');
      taxOwnerTransferPanel = document.getElementById('tax-owner-transfer-panel');
      taxIncomePanel = document.getElementById('tax-income-panel');
      taxExpenseFields = document.getElementById('tax-expense-fields');
      taxOwnerTransferFields = document.getElementById('tax-owner-transfer-fields');
      taxIncomeFields = document.getElementById('tax-income-fields');
      taxMinimizeExpenseBtn = document.getElementById('tax-minimize-expense-btn');
      taxMinimizeOwnerTransferBtn = document.getElementById('tax-minimize-owner-transfer-btn');
      taxMinimizeIncomeBtn = document.getElementById('tax-minimize-income-btn');
      taxCategoryModal = document.getElementById('tax-category-modal');
      taxCategoryCloseBtn = document.getElementById('tax-category-close-btn');
      taxCategoryXBtn = document.getElementById('tax-category-x-btn');
      expenseCategoriesListEl = document.getElementById('expense-categories-list');
      incomeCategoriesListEl = document.getElementById('income-categories-list');
      newExpenseCategoryEl = document.getElementById('new-expense-category');
      newIncomeCategoryEl = document.getElementById('new-income-category');
      addExpenseCategoryBtn = document.getElementById('add-expense-category-btn');
      addIncomeCategoryBtn = document.getElementById('add-income-category-btn');
      taxCategoryEditModal = document.getElementById('tax-category-edit-modal');
      ownerTransferModal = document.getElementById('owner-transfer-modal');
      ownerTransferCloseBtn = document.getElementById('owner-transfer-close-btn');
      yearCloseModal = document.getElementById('year-close-modal');
      yearCloseStepsEl = document.getElementById('year-close-steps');
      yearCloseCancelBtn = document.getElementById('year-close-cancel-btn');
      yearCloseApplyBtn = document.getElementById('year-close-apply-btn');
      auditPackageModal = document.getElementById('audit-package-modal');
      auditYearEl = document.getElementById('audit-year');
      auditSelectAllBtn = document.getElementById('audit-select-all-btn');
      auditCancelBtn = document.getElementById('audit-cancel-btn');
      auditGenerateBtn = document.getElementById('audit-generate-btn');
      userGuideModal = document.getElementById('user-guide-modal');
      userGuideCloseBtn = document.getElementById('user-guide-close-btn');
      userGuideTabBtns = document.querySelectorAll('[data-guide-tab]');
      userGuidePanels = document.querySelectorAll('[data-guide-panel]');
      taxCategoryEditInput = document.getElementById('tax-category-edit-input');
      taxCategoryEditSaveBtn = document.getElementById('tax-category-edit-save-btn');
      taxCategoryEditCancelBtn = document.getElementById('tax-category-edit-cancel-btn');
      taxSummaryListEl = document.getElementById('tax-summary-list');
      taxListEl = document.getElementById('tax-list');
      txCategoryFilterEl = document.getElementById('tx-category-filter');
      txFilterBtns = document.querySelectorAll('.tx-filter-btn');
      accountsTabBalancesBtn = document.getElementById('accounts-tab-balances');
      accountsTabBalanceSheetBtn = document.getElementById('accounts-tab-balance-sheet');
      accountsTabPnlBtn = document.getElementById('accounts-tab-pnl');
      accountsTabCashflowBtn = document.getElementById('accounts-tab-cashflow');
      accountsTabJournalBtn = document.getElementById('accounts-tab-journal');
      accountsYearEl = document.getElementById('accounts-year');
      accountsFromEl = document.getElementById('accounts-from');
      accountsToEl = document.getElementById('accounts-to');
      accountsRefreshBtn = document.getElementById('accounts-refresh-btn');
      accountsRebuildAutoJournalBtn = document.getElementById('accounts-rebuild-auto-journal-btn');
      orderFilterEl = document.getElementById('order-filter');
      orderRefreshBtn = document.getElementById('order-refresh-btn');
      orderListEl = document.getElementById('order-list');
      orderAddManualBtn = document.getElementById('order-add-manual-btn');
      manualOrderModal = document.getElementById('manual-order-modal');
      manualOrderCustomerNameEl = document.getElementById('manual-order-customer-name');
      manualOrderCustomerEmailEl = document.getElementById('manual-order-customer-email');
      manualOrderCustomerPhoneEl = document.getElementById('manual-order-customer-phone');
      manualOrderPaymentMethodEl = document.getElementById('manual-order-payment-method');
      manualOrderPaymentDateEl = document.getElementById('manual-order-payment-date');
      manualOrderAmountEl = document.getElementById('manual-order-amount');
      manualOrderSummaryEl = document.getElementById('manual-order-summary');
      manualOrderNotesEl = document.getElementById('manual-order-notes');
      manualOrderCancelBtn = document.getElementById('manual-order-cancel-btn');
      manualOrderSaveBtn = document.getElementById('manual-order-save-btn');
      trackingModal = document.getElementById('tracking-modal');
      trackingTitleEl = document.getElementById('tracking-title');
      trackingProviderEl = document.getElementById('tracking-provider');
      trackingNumberEl = document.getElementById('tracking-number');
      trackingUrlEl = document.getElementById('tracking-url');
      trackingCancelBtn = document.getElementById('tracking-cancel-btn');
      trackingSaveBtn = document.getElementById('tracking-save-btn');
      orderEmailModal = document.getElementById('order-email-modal');
      orderEmailTitleEl = document.getElementById('order-email-title');
      orderEmailSubjectEl = document.getElementById('order-email-subject');
      orderEmailBodyEl = document.getElementById('order-email-body');
      orderEmailPreviewEl = document.getElementById('order-email-preview');
      orderEmailTrackingWrapEl = document.getElementById('order-email-tracking-wrap');
      orderEmailTrackingNumberEl = document.getElementById('order-email-tracking-number');
      orderEmailTrackingUrlEl = document.getElementById('order-email-tracking-url');
      orderEmailCancelBtn = document.getElementById('order-email-cancel-btn');
      orderEmailSendBtn = document.getElementById('order-email-send-btn');
      reconYearEl = document.getElementById('recon-year');
      reconMonthEl = document.getElementById('recon-month');
      reconCsvEl = document.getElementById('recon-csv');
      reconRunBtn = document.getElementById('recon-run-btn');
      reconSummaryEl = document.getElementById('recon-summary');
      invoiceModeViewBtn = document.getElementById('invoice-mode-view-btn');
      invoiceModeAddBtn = document.getElementById('invoice-mode-add-btn');
      invoiceFabBtn = document.getElementById('invoice-fab-btn');
      invoiceCreateModal = document.getElementById('invoice-create-modal');
      invoiceCreateTitleEl = document.getElementById('invoice-create-title');
      invoiceCreateCancelBtn = document.getElementById('invoice-create-cancel-btn');
      invoiceCustomerNameEl = document.getElementById('invoice-customer-name');
      invoiceCustomerEmailEl = document.getElementById('invoice-customer-email');
      invoiceCustomerPhoneEl = document.getElementById('invoice-customer-phone');
      invoiceDueDateEl = document.getElementById('invoice-due-date');
      invoiceDescriptionEl = document.getElementById('invoice-description');
      invoiceLineItemsEl = document.getElementById('invoice-line-items');
      invoiceAddLineItemBtn = document.getElementById('invoice-add-line-item-btn');
      invoiceTotalDisplayEl = document.getElementById('invoice-total-display');
      invoiceCreateBtn = document.getElementById('invoice-create-btn');
      invoiceFilterEl = document.getElementById('invoice-filter');
      invoiceSortEl = document.getElementById('invoice-sort');
      invoiceRefreshBtn = document.getElementById('invoice-refresh-btn');
      invoiceListEl = document.getElementById('invoice-list');
      invoicePaymentModal = document.getElementById('invoice-payment-modal');
      invoicePaymentAmountEl = document.getElementById('invoice-payment-amount');
      invoicePaymentCancelBtn = document.getElementById('invoice-payment-cancel-btn');
      invoicePaymentSaveBtn = document.getElementById('invoice-payment-save-btn');
      reconMatchesEl = document.getElementById('recon-matches');
      quotesCollapseBtn = document.getElementById('quotes-collapse-btn');
      quotesBody = document.getElementById('quotes-body');
      quoteModeViewBtn = document.getElementById('quote-mode-view-btn');
      quoteModeAddBtn = document.getElementById('quote-mode-add-btn');
      quoteFabBtn = document.getElementById('quote-fab-btn');
      quoteCreateModal = document.getElementById('quote-create-modal');
      quoteCreateTitleEl = document.getElementById('quote-create-title');
      quoteCreateCancelBtn = document.getElementById('quote-create-cancel-btn');
      quoteCustomerNameEl = document.getElementById('quote-customer-name');
      quoteCustomerEmailEl = document.getElementById('quote-customer-email');
      quoteCustomerPhoneEl = document.getElementById('quote-customer-phone');
      quoteValidUntilEl = document.getElementById('quote-valid-until');
      quoteDescriptionEl = document.getElementById('quote-description');
      quoteLineItemsEl = document.getElementById('quote-line-items');
      quoteAddLineItemBtn = document.getElementById('quote-add-line-item-btn');
      quoteTotalDisplayEl = document.getElementById('quote-total-display');
      quoteCreateBtn = document.getElementById('quote-create-btn');
      quoteFilterEl = document.getElementById('quote-filter');
      quoteSortEl = document.getElementById('quote-sort');
      quoteRefreshBtn = document.getElementById('quote-refresh-btn');
      quoteListEl = document.getElementById('quote-list');
      accountsYearCloseBtn = document.getElementById('accounts-year-close-btn');
      auditPackageBtn = document.getElementById('audit-package-btn');
      accountsBalanceStatusEl = document.getElementById('accounts-balance-status');
      accountsListEl = document.getElementById('accounts-list');
      accountsStatementsListEl = document.getElementById('accounts-statements-list');
      accountsJournalListEl = document.getElementById('accounts-journal-list');
      taxExpenseDateEl = document.getElementById('tax-expense-date');
      taxExpenseVendorEl = document.getElementById('tax-expense-vendor');
      taxExpenseCategoryEl = document.getElementById('tax-expense-category');
      taxExpenseAmountEl = document.getElementById('tax-expense-amount');
      taxExpensePaidViaEl = document.getElementById('tax-expense-paidvia');
      taxExpenseFundingSourceEl = document.getElementById('tax-expense-funding-source');
      taxExpenseNotesEl = document.getElementById('tax-expense-notes');
      taxAddExpenseBtn = document.getElementById('tax-add-expense-btn');
      taxUpdateExpenseBtn = document.getElementById('tax-update-expense-btn');
      taxCancelExpenseEditBtn = document.getElementById('tax-cancel-expense-edit-btn');
      taxClearExpenseBtn = document.getElementById('tax-clear-expense-btn');
      taxOwnerTransferDateEl = document.getElementById('tax-owner-transfer-date');
      taxOwnerTransferTypeEl = document.getElementById('tax-owner-transfer-type');
      taxOwnerTransferAmountEl = document.getElementById('tax-owner-transfer-amount');
      taxOwnerTransferNotesEl = document.getElementById('tax-owner-transfer-notes');
      taxAddOwnerTransferBtn = document.getElementById('tax-add-owner-transfer-btn');
      taxClearOwnerTransferBtn = document.getElementById('tax-clear-owner-transfer-btn');
      taxIncomeDateEl = document.getElementById('tax-income-date');
      taxIncomeSourceEl = document.getElementById('tax-income-source');
      taxIncomeCategoryEl = document.getElementById('tax-income-category');
      taxIncomeAmountEl = document.getElementById('tax-income-amount');
      taxIncomeStripeEl = document.getElementById('tax-income-stripe');
      taxIncomeNotesEl = document.getElementById('tax-income-notes');
      taxIncomeOwnerFundedEl = document.getElementById('tax-income-owner-funded');
      taxAddIncomeBtn = document.getElementById('tax-add-income-btn');
      taxUpdateIncomeBtn = document.getElementById('tax-update-income-btn');
      taxCancelIncomeEditBtn = document.getElementById('tax-cancel-income-edit-btn');
      taxClearIncomeBtn = document.getElementById('tax-clear-income-btn');
      adminDateEl = document.getElementById('admin-date');
      adminTimeEl = document.getElementById('admin-time');
      adminReasonEl = document.getElementById('admin-reason');
      adminListEl = document.getElementById('admin-list');
      adminCalendarGridEl = document.getElementById('admin-calendar-grid');
      adminCalendarTitleEl = document.getElementById('admin-calendar-title');
      adminCalPrevBtn = document.getElementById('admin-cal-prev-btn');
      adminCalNextBtn = document.getElementById('admin-cal-next-btn');
      adminBlockBtn = document.getElementById('admin-block-btn');
      adminUnblockBtn = document.getElementById('admin-unblock-btn');
      adminBlockDayBtn = document.getElementById('admin-block-day-btn');
      adminUnblockDayBtn = document.getElementById('admin-unblock-day-btn');
      adminRefreshBtn = document.getElementById('admin-refresh-btn');
      adminCleanupPendingBtn = document.getElementById('admin-cleanup-pending-btn');
      successModal = document.getElementById('success-modal');
      successTitle = document.getElementById('success-title');
      successDetails = document.getElementById('success-details');
      successCloseBtn = document.getElementById('success-close-btn');
      errorModal = document.getElementById('error-modal');
      errorDetails = document.getElementById('error-details');
      errorCloseBtn = document.getElementById('error-close-btn');
      confirmModal = document.getElementById('confirm-modal');
      confirmDetails = document.getElementById('confirm-details');
      confirmOkBtn = document.getElementById('confirm-ok-btn');
      confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    }

    refreshDomRefs();

    // ===== State =====
    let adminSessionActive = false;
    let adminPassword = '';
    let adminInactivityTimer = null;
    const ADMIN_PASSWORD_IDLE_MS = 30 * 60 * 1000;
    let adminCalendarCursor = null;
    let allTxItems = [];
    let loadedTaxData = { income: [], expenses: [] };
    let activeTxFilter = 'all';
    let editingExpenseId = null;
    let editingIncomeId = null;
    let activeAccountsTab = 'balances';
    let activeAdminSectionTab = 'booking';
    let activeOrderEmailDraft = null;
    let orderEmailSendInFlight = false;
    let activeTrackingDraft = null;
    let blurMoneyEnabled = false;
    let activeInvoiceMode = 'view';
    let invoiceDraftItems = [{ description: 'Services', quantity: 1, unitAmount: '' }];
    let editingInvoiceId = null;
    let activeQuoteMode = 'view';
    let quoteDraftItems = [{ description: 'Services', quantity: 1, unitAmount: '' }];
    let editingQuoteId = null;

    // ===== Time Slots =====
    const TIME_SLOTS = [
      { value: '10:00-12:00', label: '1000 - 1200' },
      { value: '12:00-14:00', label: '1200 - 1400' },
      { value: '14:00-16:00', label: '1400 - 1600' },
      { value: '16:00-18:00', label: '1600 - 1800' },
      { value: '18:00-20:00', label: '1800 - 2000' }
    ];

    function initAdminTimeDropdown() {
      if (!adminTimeEl) return;
      const opts = ['<option value="">Select block…</option>'];
      for (const slot of TIME_SLOTS) {
        opts.push(`<option value="${slot.value}">${slot.label}</option>`);
      }
      adminTimeEl.innerHTML = opts.join('');
    }

    // ===== Time Utilities =====
    function nowEtParts() {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(new Date());
      const get = (t) => parts.find(p => p.type === t)?.value;
      return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        time: `${get('hour')}:${get('minute')}`
      };
    }

    function formatEtTimestamp(value) {
      const raw = (value || '').toString().trim();
      if (!raw) return 'Not sent';
      const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
      const date = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
      if (Number.isNaN(date.getTime())) return raw;
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      }).format(date);
    }

    // ===== Modals =====
    function openSuccessModal(text, title) {
      if (title) successTitle.textContent = title;
      successDetails.textContent = text;
      successModal.classList.add('active');
      successModal.setAttribute('aria-hidden', 'false');
    }

    function closeSuccessModal() {
      successModal.classList.remove('active');
      successModal.setAttribute('aria-hidden', 'true');
    }

    function openErrorModal(text) {
      errorDetails.textContent = text;
      errorModal.classList.add('active');
      errorModal.setAttribute('aria-hidden', 'false');
    }

    function renderOrderEmailPreview() {
      if (!orderEmailPreviewEl) return;
      const subject = (orderEmailSubjectEl?.value || '').trim();
      const body = (orderEmailBodyEl?.value || '').trim();
      const trackingProvider = (activeOrderEmailDraft?.trackingProvider || '').trim();
      const trackingNumber = (orderEmailTrackingNumberEl?.value || '').trim();
      const orderSummary = (activeOrderEmailDraft?.orderSummary || 'Order').trim();
      const orderNumber = (activeOrderEmailDraft?.orderNumber || '').trim();
      const amount = (activeOrderEmailDraft?.amountDisplay || '').trim();
      const paymentDate = (activeOrderEmailDraft?.paymentDate || '').trim();
      const preheader = activeOrderEmailDraft?.kind === 'delivered'
        ? 'Your order has arrived — you\'re all set.'
        : activeOrderEmailDraft?.kind === 'shipping'
          ? 'Your order is on the way.'
          : activeOrderEmailDraft?.kind === 'review'
            ? 'We\'d love to hear what you think!'
            : 'Your items are currently being quality checked';
      const blocks = body ? body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean) : [];
      const bodyHtml = blocks.map((part) => `<p style="margin:0 0 20px;color:#374151;white-space:pre-wrap;line-height:1.7;">${escHtml(part)}</p>`).join('') || '<p style="margin:0 0 20px;color:#374151;">&nbsp;</p>';
      const detailLines = [
        orderNumber ? `<strong>Order Number:</strong> ${escHtml(orderNumber)}` : '',
        `<strong>Order:</strong> ${escHtml(orderSummary)}`,
        amount ? `<strong>Amount:</strong> ${escHtml(amount)}` : '',
        paymentDate ? `<strong>Payment Date:</strong> ${escHtml(paymentDate)}` : '',
        trackingProvider ? `<strong>Carrier:</strong> ${escHtml(trackingProvider)}` : '',
        trackingNumber ? `<strong>Tracking Number:</strong> ${escHtml(trackingNumber)}` : ''
      ].filter(Boolean).join('<br>');
      const isDelivered = activeOrderEmailDraft?.kind === 'delivered';
      const isReview = activeOrderEmailDraft?.kind === 'review';
      const batteryTestNote = (activeOrderEmailDraft?.batteryTestNote || '').trim();
      const batteryTestImageKey = (activeOrderEmailDraft?.batteryTestImageKey || '').trim();
      const batteryHtml = !isDelivered && !isReview && (batteryTestNote || batteryTestImageKey)
        ? `<div style="margin:20px 0;padding:16px 20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;"><div style="font-weight:700;color:#15803d;margin-bottom:8px;">Battery Test Results</div>${batteryTestNote ? `<div style="color:#374151;white-space:pre-wrap;">${escHtml(batteryTestNote)}</div>` : ''}${batteryTestImageKey ? `<div style="margin-top:10px;"><a href="https://services.easternshore.ai/api/orders/battery-image?key=${encodeURIComponent(batteryTestImageKey)}" style="color:#2563eb;">View AccuBattery results &rarr;</a></div>` : ''}</div>`
        : '';
      const shippingGuideHtml = isDelivered
        ? `<div style="margin:28px 0 28px;padding:16px;border:1px solid #dbeafe;background:#eff6ff;border-radius:10px;color:#1e3a8a;"><div style="font-weight:700;margin-bottom:8px;">Getting Started</div><div style="line-height:1.6;">The User Guide is an app on the main screen of the phone — just tap it to open anytime.<br><br>Your case also includes two inserts: one walks you through the <strong>first steps</strong> to get set up, and the other covers <strong>how to deploy</strong> when you need it.<br><br>You can also view the full User Guide on the web here: <a href="https://www.easternshore.ai/userguide.html" style="color:#2563eb;font-weight:700;">https://www.easternshore.ai/userguide.html</a></div></div>`
        : '';
      const trustPilotHtml = isReview
        ? `<div style="margin:24px 0;text-align:center;"><a href="https://www.easternshore.ai/review" style="display:inline-block;background:#00b67a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:16px;">Leave a Review on Trustpilot &#9733;</a></div>`
        : '';
      const trackProxyUrl = !isDelivered && !isReview && trackingNumber ? `https://services.easternshore.ai/track?n=${encodeURIComponent(trackingNumber)}${trackingProvider ? `&c=${encodeURIComponent(trackingProvider)}` : ''}` : '';
      orderEmailPreviewEl.innerHTML = `<div style="font-family:Arial,sans-serif;background:#f7fafc;padding:24px;color:#111827;"><div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;"><img src="/carousel.jpg" alt="Eastern Shore AI" style="width:100%;height:auto;display:block;" /><div style="padding:20px 24px;background:linear-gradient(135deg,#0f172a,#1f2937);color:#ffffff;"><div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#67e8f9;">Eastern Shore AI</div><h1 style="margin:6px 0 0;font-size:24px;">${escHtml(subject || 'Preview')}</h1><div style="margin-top:8px;font-size:13px;color:#cbd5e1;">${escHtml(preheader)}</div></div><div style="padding:24px;"><div style="margin:0 0 16px;color:#111827;line-height:1.6;">${detailLines}</div>${bodyHtml}${batteryHtml}${trackProxyUrl ? `<div style="margin:18px 0 10px;text-align:center;"><a href="${escHtml(trackProxyUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">Track Your Shipment</a></div>` : ''}${shippingGuideHtml}${trustPilotHtml}</div><div style="padding:14px 24px;border-top:1px solid #e5e7eb;background:#f9fafb;color:#4b5563;font-size:13px;text-align:center;"><strong>Eastern Shore AI, LLC</strong> • <a href="https://www.easternshore.ai" style="color:#2563eb;">www.easternshore.ai</a><div style="margin-top:6px;">Phone: <a href="tel:+13029079162" style="color:#2563eb;">(302) 907-9162</a></div><p style="margin:6px 0 0;font-size:11px;line-height:1.45;color:#6b7280;">Privacy: We use your contact information only to fulfill your order and send related service communications.</p></div></div></div>`;
    }

    function openManualOrderModal() {
      if (manualOrderPaymentDateEl && !manualOrderPaymentDateEl.value) manualOrderPaymentDateEl.value = new Date().toISOString().slice(0,10);
      manualOrderModal?.classList.add('active');
      manualOrderModal?.setAttribute('aria-hidden', 'false');
    }

    function closeManualOrderModal() {
      manualOrderModal?.classList.remove('active');
      manualOrderModal?.setAttribute('aria-hidden', 'true');
    }

    function openTrackingModal(draft) {
      activeTrackingDraft = draft;
      if (trackingTitleEl) trackingTitleEl.textContent = draft.forShippingEmail ? 'Enter Shipping Details' : 'Add Tracking';
      if (trackingProviderEl) trackingProviderEl.value = draft.trackingProvider || '';
      if (trackingNumberEl) trackingNumberEl.value = draft.trackingNumber || '';
      trackingModal?.classList.add('active');
      trackingModal?.setAttribute('aria-hidden', 'false');
    }

    function closeTrackingModal() {
      activeTrackingDraft = null;
      trackingModal?.classList.remove('active');
      trackingModal?.setAttribute('aria-hidden', 'true');
    }

    let batteryTestOrderKey = '';
    let batteryTestOrderId = 0;

    function openBatteryTestModal(orderId, orderKey, currentNote, hasImage) {
      batteryTestOrderId = orderId;
      batteryTestOrderKey = orderKey;
      const noteEl = document.getElementById('battery-note-input');
      const fileEl = document.getElementById('battery-image-input');
      const statusEl = document.getElementById('battery-image-status');
      const saveStatusEl = document.getElementById('battery-test-save-status');
      if (noteEl) noteEl.value = currentNote || '';
      if (fileEl) fileEl.value = '';
      if (statusEl) statusEl.textContent = hasImage ? 'Screenshot already uploaded.' : 'No screenshot uploaded yet.';
      if (saveStatusEl) saveStatusEl.textContent = '';
      const modal = document.getElementById('battery-test-modal');
      if (modal) { modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false'); }
    }

    function closeBatteryTestModal() {
      const modal = document.getElementById('battery-test-modal');
      if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
    }

    document.getElementById('battery-test-cancel-btn')?.addEventListener('click', closeBatteryTestModal);
    document.getElementById('battery-test-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeBatteryTestModal();
    });
    document.getElementById('battery-test-save-btn')?.addEventListener('click', async () => {
      const note = (document.getElementById('battery-note-input')?.value || '').trim();
      const imageFile = document.getElementById('battery-image-input')?.files?.[0];
      const saveStatusEl = document.getElementById('battery-test-save-status');
      if (saveStatusEl) saveStatusEl.textContent = 'Saving\u2026';
      const fd = new FormData();
      fd.append('orderKey', batteryTestOrderKey);
      fd.append('note', note);
      if (imageFile) fd.append('image', imageFile);
      try {
        const res = await fetch(ORDER_BATTERY_TEST_API_URL, {
          method: 'POST',
          headers: { 'X-Admin-Password': adminPassword },
          body: fd
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { if (saveStatusEl) saveStatusEl.textContent = data.error || 'Save failed'; return; }
        if (saveStatusEl) saveStatusEl.textContent = 'Saved!';
        setTimeout(async () => { closeBatteryTestModal(); await refreshOrderList(); }, 700);
      } catch { if (saveStatusEl) saveStatusEl.textContent = 'Network error'; }
    });

    function openOrderEmailModal(draft) {
      const draftId = (globalThis.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : `order-email-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      activeOrderEmailDraft = { ...draft, idempotencyKey: draft.idempotencyKey || draftId };
      if (orderEmailTitleEl) orderEmailTitleEl.textContent = draft.kind === 'shipping' ? 'Preview Shipping Email' : draft.kind === 'delivered' ? 'Preview Delivered Email' : draft.kind === 'review' ? 'Preview Review Email' : 'Preview Order Acknowledgment';
      if (orderEmailSubjectEl) orderEmailSubjectEl.value = draft.subject || '';
      if (orderEmailBodyEl) orderEmailBodyEl.value = draft.bodyText || '';
      if (orderEmailTrackingNumberEl) orderEmailTrackingNumberEl.value = draft.trackingNumber || '';
      if (orderEmailTrackingWrapEl) orderEmailTrackingWrapEl.style.display = draft.kind === 'shipping' ? '' : 'none';
      if (orderEmailTrackingNumberEl) orderEmailTrackingNumberEl.value = draft.trackingNumber || '';
      renderOrderEmailPreview();
      orderEmailModal?.classList.add('active');
      orderEmailModal?.setAttribute('aria-hidden', 'false');
    }

    function closeOrderEmailModal() {
      activeOrderEmailDraft = null;
      orderEmailModal?.classList.remove('active');
      orderEmailModal?.setAttribute('aria-hidden', 'true');
    }

    function closeErrorModal() {
      errorModal.classList.remove('active');
      errorModal.setAttribute('aria-hidden', 'true');
    }

    function resetInvoiceForm() {
      if (invoiceDescriptionEl) invoiceDescriptionEl.value = '';
      if (invoiceCustomerEmailEl) invoiceCustomerEmailEl.value = '';
      if (invoiceCustomerPhoneEl) invoiceCustomerPhoneEl.value = '';
      if (invoiceCustomerNameEl) invoiceCustomerNameEl.value = '';
      if (invoiceDueDateEl) invoiceDueDateEl.value = '';
      editingInvoiceId = null;
      invoiceDraftItems = [{ description: 'Services', quantity: 1, unitAmount: '' }];
      renderInvoiceLineItems();
      if (invoiceCreateBtn) invoiceCreateBtn.textContent = 'Create Invoice';
      if (invoiceCreateTitleEl) invoiceCreateTitleEl.textContent = 'Create New Invoice';
    }

    function openInvoiceCreateModal() {
      invoiceCreateModal?.classList.add('active');
      invoiceCreateModal?.setAttribute('aria-hidden', 'false');
      invoiceCustomerNameEl?.focus();
    }

    function closeInvoiceCreateModal() {
      invoiceCreateModal?.classList.remove('active');
      invoiceCreateModal?.setAttribute('aria-hidden', 'true');
      resetInvoiceForm();
    }

    function setInvoiceMode(mode = 'view') {
      activeInvoiceMode = mode === 'add' ? 'add' : 'view';
      invoiceModeViewBtn?.classList.toggle('active', activeInvoiceMode === 'view');
      invoiceModeAddBtn?.classList.toggle('active', activeInvoiceMode === 'add');
      invoiceModeViewBtn?.setAttribute('aria-selected', activeInvoiceMode === 'view' ? 'true' : 'false');
      invoiceModeAddBtn?.setAttribute('aria-selected', activeInvoiceMode === 'add' ? 'true' : 'false');
      if (activeInvoiceMode === 'add') {
        resetInvoiceForm();
        openInvoiceCreateModal();
        activeInvoiceMode = 'view';
        invoiceModeViewBtn?.classList.add('active');
        invoiceModeAddBtn?.classList.remove('active');
        invoiceModeViewBtn?.setAttribute('aria-selected', 'true');
        invoiceModeAddBtn?.setAttribute('aria-selected', 'false');
      }
    }

    function setUserGuideTab(tab) {
      userGuideTabBtns.forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-guide-tab') === tab));
      userGuidePanels.forEach((panel) => {
        panel.style.display = panel.getAttribute('data-guide-panel') === tab ? 'block' : 'none';
      });
    }

    function markMoneyBlurTargets() {
      const scope = document.getElementById('admin-controls') || document.body;
      const nodes = scope.querySelectorAll('div,span,strong,p,li,h4,a,label,button');
      nodes.forEach((el) => {
        if (el.closest('#admin-blur-amounts-btn')) return;
        const txt = (el.textContent || '').trim();
        if (/\$\s?\d/.test(txt) && el.children.length === 0) {
          el.classList.add('money-blur-target');
        }
      });
    }

    function setBlurMoney(on) {
      blurMoneyEnabled = !!on;
      document.body.classList.toggle('money-blur-on', blurMoneyEnabled);
      if (adminBlurAmountsBtn) {
        const eyeSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        const eyeOffSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
        adminBlurAmountsBtn.innerHTML = blurMoneyEnabled ? eyeOffSvg : eyeSvg;
        adminBlurAmountsBtn.title = blurMoneyEnabled ? 'Amount blur: On' : 'Amount blur: Off';
        adminBlurAmountsBtn.setAttribute('aria-label', blurMoneyEnabled ? 'Amount blur on' : 'Amount blur off');
        adminBlurAmountsBtn.classList.toggle('active', blurMoneyEnabled);
      }
      try { localStorage.setItem('esa_blur_money', blurMoneyEnabled ? '1' : '0'); } catch {}
      markMoneyBlurTargets();
    }

    function loadBlurMoneyPref() {
      try {
        const v = localStorage.getItem('esa_blur_money');
        setBlurMoney(v === '1');
      } catch {
        setBlurMoney(false);
      }
    }

    function openOwnerTransferModal() {
      clearTaxOwnerTransferForm();
      ownerTransferModal?.classList.add('active');
      ownerTransferModal?.setAttribute('aria-hidden', 'false');
    }

    function closeOwnerTransferModal() {
      ownerTransferModal?.classList.remove('active');
      ownerTransferModal?.setAttribute('aria-hidden', 'true');
    }

    async function openYearCloseWizard() {
      const year = accountsYearEl?.value;
      if (!/^\d{4}$/.test(year || '')) { openErrorModal('Select a valid year before running year-end close.'); return; }
      yearCloseModal?.classList.add('active');
      yearCloseModal?.setAttribute('aria-hidden', 'false');
      yearCloseStepsEl.textContent = 'Loading preview…';
      try {
        const res = await fetch(ACCOUNTS_YEAR_CLOSE_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({ year, apply: false })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Preview failed');
        const steps = data.preview?.steps || [];
        yearCloseStepsEl.innerHTML = steps.map((s) => `<div style="padding:.35rem 0; border-bottom:1px dashed var(--line);"><strong>Step ${s.step}:</strong> ${escHtml(s.title)} <span style="float:right;">$${(Number(s.amount_cents||0)/100).toFixed(2)}</span></div>`).join('') || 'No close steps found.';
      } catch (e) {
        yearCloseStepsEl.textContent = `Could not load year-close preview: ${e.message || e}`;
      }
    }

    function closeYearCloseWizard() {
      yearCloseModal?.classList.remove('active');
      yearCloseModal?.setAttribute('aria-hidden', 'true');
    }

    function openAuditPackageModal() {
      if (auditYearEl && accountsYearEl?.value) auditYearEl.value = accountsYearEl.value;
      auditPackageModal?.classList.add('active');
      auditPackageModal?.setAttribute('aria-hidden', 'false');
    }

    function closeAuditPackageModal() {
      auditPackageModal?.classList.remove('active');
      auditPackageModal?.setAttribute('aria-hidden', 'true');
    }

    function buildPdfBlob(title, lines) {
      const jspdfNs = window.jspdf;
      if (!jspdfNs?.jsPDF) throw new Error('jsPDF failed to load');
      const doc = new jspdfNs.jsPDF({ orientation: 'p', unit: 'pt', format: 'letter' });
      let y = 50;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(title, 40, y);
      y += 24;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      for (const line of lines) {
        if (y > 740) { doc.addPage(); y = 50; }
        doc.text(String(line).slice(0, 120), 40, y);
        y += 14;
      }
      return doc.output('blob');
    }

    async function generateAuditPackage() {
      const year = auditYearEl?.value;
      if (!/^\d{4}$/.test(year || '')) { openErrorModal('Select a valid year.'); return; }
      const selected = Array.from(document.querySelectorAll('#audit-doc-list input[type="checkbox"]:checked')).map(i => i.value);
      if (!selected.length) { openErrorModal('Select at least one document.'); return; }
      if (typeof JSZip === 'undefined') { openErrorModal('JSZip not loaded — refresh and try again.'); return; }

      auditGenerateBtn.disabled = true;
      auditGenerateBtn.textContent = 'Building…';
      try {
        const zip = new JSZip();
        const root = zip.folder(`audit-package-${year}`);

        const [txRes, summaryRes, statementsRes, journalRes] = await Promise.all([
          fetch(`${TAX_TX_API_URL}?year=${encodeURIComponent(year)}&type=all&limit=5000`, { headers: { 'X-Admin-Password': adminPassword } }),
          fetch(`${ACCOUNTS_SUMMARY_API_URL}?year=${encodeURIComponent(year)}`, { headers: { 'X-Admin-Password': adminPassword } }),
          fetch(`${ACCOUNTS_STATEMENTS_API_URL}?year=${encodeURIComponent(year)}`, { headers: { 'X-Admin-Password': adminPassword } }),
          fetch(`${ACCOUNTS_JOURNAL_API_URL}?year=${encodeURIComponent(year)}&limit=5000`, { headers: { 'X-Admin-Password': adminPassword } })
        ]);
        const txData = await txRes.json();
        const summaryData = await summaryRes.json();
        const stData = await statementsRes.json();
        const journalData = await journalRes.json();

        const money = (c) => `$${(Number(c || 0)/100).toFixed(2)}`;

        if (selected.includes('tax_csv')) {
          const csvRes = await fetch(`${TAX_EXPORT_API_URL}?year=${encodeURIComponent(year)}&type=all`, { headers: { 'X-Admin-Password': adminPassword } });
          if (csvRes.ok) root.file(`tax-transactions-${year}.csv`, await csvRes.blob());
        }

        if (selected.includes('journal_csv')) {
          const lines = ['date,memo,account,debit,credit'];
          for (const e of (journalData.entries || [])) {
            for (const l of (e.lines || [])) {
              lines.push(`${e.entry_date || ''},"${(e.memo || '').replace(/"/g,'""')}","${l.code} ${l.name}",${(Number(l.debit_cents||0)/100).toFixed(2)},${(Number(l.credit_cents||0)/100).toFixed(2)}`);
            }
          }
          root.file(`journal-${year}.csv`, lines.join('\n'));
        }

        if (selected.includes('trial_balance_pdf')) {
          const lines = (summaryData.accounts || []).map(a => `${a.code} ${a.name} | Balance ${money(a.balance_cents)}`);
          root.file(`trial-balance-${year}.pdf`, await buildPdfBlob(`Trial Balance ${year}`, lines));
        }

        if (selected.includes('balance_sheet_pdf')) {
          const totalAssets = Number(stData.totals?.assets || 0);
          const totalLiabilities = Number(stData.totals?.liabilities || 0);
          const totalEquity = Number(stData.totals?.equity || 0);
          const currentEarnings = Number(stData.totals?.income || 0) - Number(stData.totals?.expenses || 0);
          const adjustedEquity = totalEquity + currentEarnings;
          const totalLE = totalLiabilities + adjustedEquity;
          const balancedText = totalAssets === totalLE ? 'Balanced YES' : 'Balanced NO';

          const lines = [
            'Assets:',
            ...(stData.balanceSheet?.assets || []).map(a => `${a.code} ${a.name} ${money(a.balance_cents)}`),
            `Total Assets: ${money(totalAssets)}`,
            '',
            'Liabilities:',
            ...(stData.balanceSheet?.liabilities || []).map(a => `${a.code} ${a.name} ${money(a.balance_cents)}`),
            `Total Liabilities: ${money(totalLiabilities)}`,
            '',
            'Equity:',
            ...(stData.balanceSheet?.equity || []).map(a => `${a.code} ${a.name} ${money(a.balance_cents)}`),
            `Current Period Earnings: ${money(currentEarnings)}`,
            `Adjusted Equity: ${money(adjustedEquity)}`,
            '',
            `Accounting Equation Check: ${balancedText}`,
            `Assets: ${money(totalAssets)}`,
            `Liabilities + Adjusted Equity: ${money(totalLE)}`
          ];
          root.file(`balance-sheet-${year}.pdf`, await buildPdfBlob(`Balance Sheet ${year}`, lines));
        }

        if (selected.includes('pnl_pdf')) {
          const lines = [
            'Income:',
            ...(stData.incomeStatement?.income || []).map(a => `${a.code} ${a.name} ${money(a.balance_cents)}`),
            '',
            'Expenses:',
            ...(stData.incomeStatement?.expenses || []).map(a => `${a.code} ${a.name} ${money(a.balance_cents)}`),
            '',
            `Net Income: ${money((Number(stData.totals?.income||0)-Number(stData.totals?.expenses||0)))}`
          ];
          root.file(`income-statement-profit-loss-${year}.pdf`, await buildPdfBlob(`Income Statement (Profit & Loss) ${year}`, lines));
        }

        if (selected.includes('cashflow_pdf')) {
          const lines = [
            `Net Cash Change: ${money(stData.cashFlow?.netCashChange)}`,
            stData.cashFlow?.note || ''
          ];
          root.file(`cash-flow-${year}.pdf`, await buildPdfBlob(`Cash Flow ${year}`, lines));
        }

        if (selected.includes('receipts')) {
          const recFolder = root.folder('receipts');
          const allRecords = [
            ...(txData.expenses || []).map(r => ({ ...r, type: 'expense' })),
            ...(txData.income || []).map(r => ({ ...r, type: 'income' }))
          ];
          for (const r of allRecords) {
            if (!r.receipt_key) continue;
            const ext = (r.receipt_key.split('.').pop() || 'bin').slice(0, 5);
            const fn = `${r.type}-${r.id}-${r.date}.${ext}`;
            const rr = await fetch(`${TAX_RECEIPT_URL}?key=${encodeURIComponent(r.receipt_key)}`, { headers: { 'X-Admin-Password': adminPassword } });
            if (rr.ok) recFolder.file(fn, await rr.blob());
          }
        }

        const manifestLines = [
          `Audit Package Year: ${year}`,
          `Generated At: ${new Date().toISOString()}`,
          `Selected Documents: ${selected.join(', ')}`,
          `Includes Receipts: ${selected.includes('receipts') ? 'yes' : 'no'}`
        ];
        root.file('manifest.txt', manifestLines.join('\n'));

        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `audit-package-${year}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1200);
        closeAuditPackageModal();
      } catch (e) {
        openErrorModal(`Could not build audit package: ${e.message || e}`);
      } finally {
        auditGenerateBtn.disabled = false;
        auditGenerateBtn.textContent = 'Generate ZIP';
      }
    }

    async function applyYearCloseWizard() {
      const year = accountsYearEl?.value;
      const ok = await openConfirmModal(`Apply formal year-end closing entries for ${year}? Existing close entries for that year will be replaced.`, 'Apply Year-End Close?', 'Apply');
      if (!ok) return;
      try {
        const res = await fetch(ACCOUNTS_YEAR_CLOSE_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({ year, apply: true })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Year close failed');
        closeYearCloseWizard();
        await loadAccountsData();
        openSuccessModal(`Year-end close applied for ${year}.`, 'Year Closed ✅');
      } catch (e) {
        openErrorModal(`Year-end close failed: ${e.message || e}`);
      }
    }

    function openUserGuideModal(tab = 'expenses') {
      if (!userGuideModal) return;
      setUserGuideTab(tab);
      userGuideModal.classList.add('active');
      userGuideModal.setAttribute('aria-hidden', 'false');
    }

    function closeUserGuideModal() {
      if (!userGuideModal) return;
      userGuideModal.classList.remove('active');
      userGuideModal.setAttribute('aria-hidden', 'true');
    }

    function openConfirmModal(text, title = 'Please Confirm', confirmLabel = 'Confirm') {
      return new Promise((resolve) => {
        const confirmTitleEl = document.getElementById('confirm-title');
        confirmTitleEl.textContent = title;
        confirmDetails.textContent = text;
        confirmOkBtn.textContent = confirmLabel;
        confirmModal.classList.add('active');
        confirmModal.setAttribute('aria-hidden', 'false');

        const cleanup = () => {
          confirmModal.classList.remove('active');
          confirmModal.setAttribute('aria-hidden', 'true');
          confirmOkBtn.removeEventListener('click', onOk);
          confirmCancelBtn.removeEventListener('click', onCancel);
          confirmModal.removeEventListener('click', onOverlay);
        };
        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        const onOverlay = (e) => { if (e.target === confirmModal) onCancel(); };

        confirmOkBtn.addEventListener('click', onOk);
        confirmCancelBtn.addEventListener('click', onCancel);
        confirmModal.addEventListener('click', onOverlay);
      });
    }

    let pendingInvoicePayment = null;
    function openInvoicePaymentModal(invoiceId) {
      pendingInvoicePayment = Number(invoiceId || 0) || null;
      if (invoicePaymentAmountEl) invoicePaymentAmountEl.value = '';
      invoicePaymentModal?.classList.add('active');
      invoicePaymentModal?.setAttribute('aria-hidden', 'false');
      setTimeout(() => invoicePaymentAmountEl?.focus(), 0);
    }
    function closeInvoicePaymentModal() {
      invoicePaymentModal?.classList.remove('active');
      invoicePaymentModal?.setAttribute('aria-hidden', 'true');
      pendingInvoicePayment = null;
    }
    async function submitInvoicePaymentModal() {
      const id = Number(pendingInvoicePayment || 0);
      const amt = Number(invoicePaymentAmountEl?.value || 0);
      if (!id) { closeInvoicePaymentModal(); return; }
      if (!Number.isFinite(amt) || amt <= 0) { openErrorModal('Invalid payment amount.'); return; }
      const eventId = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `pay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const res = await fetch(INVOICE_PAYMENT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
        body: JSON.stringify({ id, paymentCents: Math.round(amt * 100), paymentEventId: eventId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { openErrorModal(data.error || 'Payment update failed'); return; }
      closeInvoicePaymentModal();
      if (data.duplicateEvent) {
        openSuccessModal('Payment already recorded', 'This payment event was already posted to books.');
      } else {
        openSuccessModal('Payment recorded', 'Invoice payment was recorded and books were updated.');
      }
      await refreshInvoiceList();
    }

    successCloseBtn.addEventListener('click', closeSuccessModal);
    successModal.addEventListener('click', (e) => { if (e.target === successModal) closeSuccessModal(); });
    errorCloseBtn.addEventListener('click', closeErrorModal);
    errorModal.addEventListener('click', (e) => { if (e.target === errorModal) closeErrorModal(); });
    userGuideCloseBtn?.addEventListener('click', closeUserGuideModal);
    userGuideModal?.addEventListener('click', (e) => { if (e.target === userGuideModal) closeUserGuideModal(); });
    ownerTransferCloseBtn?.addEventListener('click', closeOwnerTransferModal);
    ownerTransferModal?.addEventListener('click', (e) => { if (e.target === ownerTransferModal) closeOwnerTransferModal(); });
    invoiceCreateCancelBtn?.addEventListener('click', closeInvoiceCreateModal);
    invoiceCreateModal?.addEventListener('click', (e) => { if (e.target === invoiceCreateModal) closeInvoiceCreateModal(); });

    yearCloseCancelBtn?.addEventListener('click', closeYearCloseWizard);
    yearCloseApplyBtn?.addEventListener('click', applyYearCloseWizard);
    yearCloseModal?.addEventListener('click', (e) => { if (e.target === yearCloseModal) closeYearCloseWizard(); });
    auditCancelBtn?.addEventListener('click', closeAuditPackageModal);
    auditGenerateBtn?.addEventListener('click', generateAuditPackage);
    auditSelectAllBtn?.addEventListener('click', () => {
      const boxes = Array.from(document.querySelectorAll('#audit-doc-list input[type="checkbox"]'));
      const allChecked = boxes.every(b => b.checked);
      boxes.forEach(b => { b.checked = !allChecked; });
      auditSelectAllBtn.textContent = allChecked ? 'Select All' : 'Clear All';
    });
    auditPackageModal?.addEventListener('click', (e) => { if (e.target === auditPackageModal) closeAuditPackageModal(); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && successModal.classList.contains('active')) closeSuccessModal();
      if (e.key === 'Escape' && errorModal.classList.contains('active')) closeErrorModal();
      if (e.key === 'Escape' && userGuideModal?.classList.contains('active')) closeUserGuideModal();
      if (e.key === 'Escape' && ownerTransferModal?.classList.contains('active')) closeOwnerTransferModal();
      if (e.key === 'Escape' && invoiceCreateModal?.classList.contains('active')) closeInvoiceCreateModal();
      if (e.key === 'Escape' && invoicePaymentModal?.classList.contains('active')) closeInvoicePaymentModal();
      if (e.key === 'Escape' && yearCloseModal?.classList.contains('active')) closeYearCloseWizard();
      if (e.key === 'Escape' && auditPackageModal?.classList.contains('active')) closeAuditPackageModal();
    });

    // ===== Admin Controls =====
    function updateInvoiceFabVisibility() {
      if (!invoiceFabBtn) return;
      const shouldShow = adminSessionActive && activeAdminSectionTab === 'invoices';
      invoiceFabBtn.style.display = shouldShow ? 'inline-flex' : 'none';
    }

    function injectAdminControls() {
      if (document.getElementById('admin-controls')) return;
      const template = document.getElementById('admin-controls-template');
      const mount = document.getElementById('admin-controls-mount');
      if (!template || !mount) throw new Error('Admin controls template missing');
      mount.appendChild(template.content.cloneNode(true));
      refreshDomRefs();
      initAdminTimeDropdown();
      bindAdminControlListeners();
    }

    function removeAdminControls() {
      const mount = document.getElementById('admin-controls-mount');
      if (mount) mount.textContent = '';
      adminPassword = '';
      if (adminKeyEl) adminKeyEl.value = '';
      clearTimeout(adminInactivityTimer);
      adminInactivityTimer = null;
      adminSessionActive = false;
      adminControlListenersBound = false;
      clearAdminAuthenticatedSession();
      refreshDomRefs();
      if (adminLock) adminLock.style.display = 'block';
      if (adminHeaderTools) adminHeaderTools.style.display = 'none';
      updateInvoiceFabVisibility();
    }

    function setAdminUnlocked(on) {
      adminSessionActive = !!on;
      if (adminLock) adminLock.style.display = adminSessionActive ? 'none' : 'block';
      if (adminControls) adminControls.classList.toggle('active', adminSessionActive);
      if (adminHeaderTools) adminHeaderTools.style.display = adminSessionActive ? 'flex' : 'none';
      updateInvoiceFabVisibility();
    }

    function renderAdminCalendar(bookings = [], blockedSlots = [], blockedDays = []) {
      const cursor = adminCalendarCursor || new Date();
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const daysInMonth = last.getDate();
      const startDow = first.getDay();

      const openclawByDay = new Map();
      const lessonsByDay = new Map();
      const blockedByDay = new Map();
      const blockedWholeDay = new Set();

      for (const b of bookings) {
        const d = (b.setup_date || '').trim();
        if (!d) continue;
        const isLessons = (b.service_type || '').toLowerCase() === 'lessons';
        if (isLessons) {
          lessonsByDay.set(d, (lessonsByDay.get(d) || 0) + 1);
        } else {
          openclawByDay.set(d, (openclawByDay.get(d) || 0) + 1);
        }
      }
      for (const s of blockedSlots) {
        if (!s.active) continue;
        const d = (s.setup_date || '').trim();
        if (!d) continue;
        blockedByDay.set(d, (blockedByDay.get(d) || 0) + 1);
      }
      for (const d of blockedDays) {
        if (!d.active) continue;
        const key = (d.setup_date || '').trim();
        if (!key) continue;
        blockedWholeDay.add(key);
        blockedByDay.set(key, (blockedByDay.get(key) || 0) + 1);
      }

      const monthName = first.toLocaleString('en-US', { month: 'long' });
      adminCalendarTitleEl.textContent = `Availability Calendar — ${monthName} ${year}`;

      const parts = [];
      const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      for (const d of dows) parts.push(`<div class="admin-cal-dow">${d}</div>`);

      for (let i = 0; i < startDow; i++) {
        parts.push('<div class="admin-cal-day empty"></div>');
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const key = `${year}-${mm}-${dd}`;
        const openclawCount = openclawByDay.get(key) || 0;
        const lessonsCount = lessonsByDay.get(key) || 0;
        const xCount = blockedByDay.get(key) || 0;
        const dots = [];
        for (let i = 0; i < Math.min(3, openclawCount); i++) dots.push('<i class="admin-dot booked-openclaw" title="OpenClaw booking"></i>');
        for (let i = 0; i < Math.min(3, lessonsCount); i++) dots.push('<i class="admin-dot booked-lessons" title="Lessons booking"></i>');
        if (blockedWholeDay.has(key)) {
          dots.push('<i class="admin-dot blocked" title="Entire day blocked"></i>');
        } else {
          for (let i = 0; i < Math.min(3, xCount); i++) dots.push('<i class="admin-dot blocked" title="Blocked"></i>');
        }
        parts.push(`<div class="admin-cal-day"><div class="admin-cal-day-num">${day}</div><div class="admin-cal-dots">${dots.join('')}</div></div>`);
      }

      adminCalendarGridEl.innerHTML = parts.join('');
    }

    async function loadAdminData() {
      if (!adminSessionActive) return;
      try {
        const res = await fetch(`${BOOKINGS_API_URL}?limit=200`, {
          headers: { 'X-Admin-Password': adminPassword }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        const bookingRows = (data.bookings || []).map((b) => {
          const svc = b.service_type === 'lessons' ? 'LESSONS' : (b.service_type || '').startsWith('survival_node') || b.service_type === 'byog_setup' ? 'SURVIVAL NODE' : 'OPENCLAW';
          return `<div>[BOOKING:${svc}] ${b.status} | ${b.setup_at || '(n/a)'} | ${b.customer_name || '(no name)'}</div>`;
        });

        const blockedSlotRows = (data.blockedSlots || []).map((s) => {
          const k = `${s.setup_date || ''}|${s.setup_time || ''}`;
          return `<div style="display:flex; align-items:center; justify-content:space-between; gap:.5rem;"><span>[BLOCKED SLOT] ${s.active ? 'active' : 'inactive'} | ${s.setup_at} | ${s.reason || '(no reason)'}</span><button type="button" class="btn delete" data-blocked-slot-delete="${k}">Delete</button></div>`;
        });

        const blockedDayRows = (data.blockedDays || []).map((d) => {
          const k = `${d.setup_date || ''}`;
          return `<div style="display:flex; align-items:center; justify-content:space-between; gap:.5rem;"><span>[BLOCKED DAY] ${d.active ? 'active' : 'inactive'} | ${d.setup_date} | ${d.reason || '(no reason)'}</span><button type="button" class="btn delete" data-blocked-day-delete="${k}">Delete</button></div>`;
        });

        const html = [...bookingRows, ...blockedSlotRows, ...blockedDayRows].join('');
        adminListEl.innerHTML = html || 'No records yet.';

        adminListEl.querySelectorAll('[data-blocked-slot-delete]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const raw = btn.getAttribute('data-blocked-slot-delete') || '';
            const [setupDate, setupTime] = raw.split('|');
            if (!setupDate || !setupTime) return;
            const ok = await openConfirmModal(`Delete blocked slot ${setupDate} ${setupTime}?`, 'Delete Blocked Slot?', 'Delete');
            if (!ok) return;
            try {
              await fetch(`${BLOCK_SLOT_API_URL}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
                body: JSON.stringify({ setupDate, setupTime, reason: '', active: false })
              });
              await loadAdminData();
              openSuccessModal('Blocked slot deleted successfully.', 'Record Deleted ✅');
            } catch (e) {
              openErrorModal(`Could not delete blocked slot: ${e.message || e}`);
            }
          });
        });

        adminListEl.querySelectorAll('[data-blocked-day-delete]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const setupDate = btn.getAttribute('data-blocked-day-delete') || '';
            if (!setupDate) return;
            const ok = await openConfirmModal(`Delete blocked day ${setupDate}?`, 'Delete Blocked Day?', 'Delete');
            if (!ok) return;
            try {
              await fetch(`${BLOCK_DAY_API_URL}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
                body: JSON.stringify({ setupDate, reason: '', active: false })
              });
              await loadAdminData();
              openSuccessModal('Blocked day deleted successfully.', 'Record Deleted ✅');
            } catch (e) {
              openErrorModal(`Could not delete blocked day: ${e.message || e}`);
            }
          });
        });

        renderAdminCalendar(data.bookings || [], data.blockedSlots || [], data.blockedDays || []);
        markMoneyBlurTargets();
      } catch (e) {
        adminListEl.textContent = `Error loading admin data: ${e.message || e}`;
      }
    }

    async function setBlockedSlot(active) {
      const setupDate = adminDateEl.value;
      const setupTime = adminTimeEl.value;
      if (!adminPassword || !setupDate || !setupTime) {
        openErrorModal('Admin password + date + time are required.');
        return;
      }
      const proceed = await openConfirmModal(
        `${active ? 'Block' : 'Unblock'} slot ${setupDate} ${setupTime}?`,
        active ? 'Block Slot?' : 'Unblock Slot?',
        active ? 'Block' : 'Unblock'
      );
      if (!proceed) return;
      try {
        const res = await fetch(`${BLOCK_SLOT_API_URL}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({
            setupDate,
            setupTime,
            reason: adminReasonEl.value.trim(),
            active
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update slot');
        await loadAdminData();
        openSuccessModal(`Slot ${active ? 'blocked' : 'unblocked'} successfully.`, active ? 'Slot Blocked ✅' : 'Slot Unblocked ✅');
      } catch (e) {
        openErrorModal(`Could not update slot: ${e.message || e}`);
      }
    }

    async function setBlockedDay(active) {
      const setupDate = adminDateEl.value;
      if (!adminPassword || !setupDate) {
        openErrorModal('Admin password + date are required.');
        return;
      }
      const proceed = await openConfirmModal(
        `${active ? 'Block' : 'Unblock'} day ${setupDate}?`,
        active ? 'Block Day?' : 'Unblock Day?',
        active ? 'Block' : 'Unblock'
      );
      if (!proceed) return;
      try {
        const res = await fetch(`${BLOCK_DAY_API_URL}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({
            setupDate,
            reason: adminReasonEl.value.trim(),
            active
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update day');
        await loadAdminData();
        openSuccessModal(`Day ${active ? 'blocked' : 'unblocked'} successfully.`, active ? 'Day Blocked ✅' : 'Day Unblocked ✅');
      } catch (e) {
        openErrorModal(`Could not update day: ${e.message || e}`);
      }
    }

    async function cleanupOldPendingBookings() {
      if (!adminPassword) {
        openErrorModal('Unlock admin first.');
        return;
      }
      const proceed = await openConfirmModal(
        'Delete all pending bookings older than 5 days? This cannot be undone.',
        'Clear Old Pending Bookings?',
        'Delete'
      );
      if (!proceed) return;
      try {
        const res = await fetch(`${CLEANUP_PENDING_BOOKINGS_API_URL}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({ days: 5 })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'Cleanup failed');
        await loadAdminData();
        openSuccessModal(`Removed ${Number(data.deleted || 0)} pending booking(s) older than ${Number(data.days || 5)} days.`, 'Pending Cleanup Complete ✅');
      } catch (e) {
        openErrorModal(`Could not clear pending bookings: ${e.message || e}`);
      }
    }

    // ===== Category Management =====
    const DEFAULT_TAX_EXPENSE_CATEGORIES = [
      'Startup cost', 'Advertising/Marketing', 'Software/SaaS', 'Hosting/Cloud', 'AI Services', 'Web Services',
      'Hardware', 'Research & Development', 'Product Testing', 'Office Supplies', 'Travel', 'Meals', 'Education',
      'Professional Services', 'Payment Processing Fees',
      'Inventory - Survival Node Components', 'Shipping - Survival Node Fulfillment', 'Packaging - Survival Node Fulfillment',
      'LLC Fees', 'Business License Fees', 'Taxes - Sales & Use', 'Shipping Insurance Reimbursement',
      'Other'
    ];

    const DEFAULT_TAX_INCOME_CATEGORIES = [
      'OpenClaw Setup', 'Consulting', 'Website Design', 'AI Lessons', 'Domain Sale',
      'Survival Node Sales', 'Survival Node BYOG Setup',
      'Bank Interest',
      'Shipping Insurance Reimbursement', 'Owner Funded (Non-Revenue)', 'Other'
    ];

    let TAX_EXPENSE_CATEGORIES = [...DEFAULT_TAX_EXPENSE_CATEGORIES];
    let TAX_INCOME_CATEGORIES = [...DEFAULT_TAX_INCOME_CATEGORIES];

    function escHtml(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function saveCategoryPrefs() {
      localStorage.setItem('esa_tax_expense_categories', JSON.stringify(TAX_EXPENSE_CATEGORIES));
      localStorage.setItem('esa_tax_income_categories', JSON.stringify(TAX_INCOME_CATEGORIES));
    }

    function loadCategoryPrefs() {
      try {
        const exp = JSON.parse(localStorage.getItem('esa_tax_expense_categories') || 'null');
        const inc = JSON.parse(localStorage.getItem('esa_tax_income_categories') || 'null');
        if (Array.isArray(exp) && exp.length) TAX_EXPENSE_CATEGORIES = [...new Set(exp.map(v => String(v).trim()).filter(Boolean))];
        if (Array.isArray(inc) && inc.length) TAX_INCOME_CATEGORIES = [...new Set(inc.map(v => String(v).trim()).filter(Boolean))];
      } catch {}
      // Ensure newly shipped default categories still appear for existing users with saved prefs.
      for (const c of DEFAULT_TAX_EXPENSE_CATEGORIES) {
        if (!TAX_EXPENSE_CATEGORIES.some(v => v.toLowerCase() === c.toLowerCase())) TAX_EXPENSE_CATEGORIES.push(c);
      }
      for (const c of DEFAULT_TAX_INCOME_CATEGORIES) {
        if (!TAX_INCOME_CATEGORIES.some(v => v.toLowerCase() === c.toLowerCase())) TAX_INCOME_CATEGORIES.push(c);
      }
    }

    function renderCategoryOptions() {
      taxExpenseCategoryEl.innerHTML = TAX_EXPENSE_CATEGORIES.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
      taxIncomeCategoryEl.innerHTML = TAX_INCOME_CATEGORIES.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    }

    function openCategoryEditModal(currentName) {
      return new Promise((resolve) => {
        taxCategoryEditInput.value = currentName || '';
        taxCategoryEditModal.classList.add('active');
        taxCategoryEditModal.setAttribute('aria-hidden', 'false');
        taxCategoryEditInput.focus();
        taxCategoryEditInput.select();

        const cleanup = () => {
          taxCategoryEditModal.classList.remove('active');
          taxCategoryEditModal.setAttribute('aria-hidden', 'true');
          taxCategoryEditSaveBtn.removeEventListener('click', onSave);
          taxCategoryEditCancelBtn.removeEventListener('click', onCancel);
          taxCategoryEditModal.removeEventListener('click', onOverlay);
        };
        const onSave = () => { const v = (taxCategoryEditInput.value || '').trim(); cleanup(); resolve(v || null); };
        const onCancel = () => { cleanup(); resolve(null); };
        const onOverlay = (e) => { if (e.target === taxCategoryEditModal) onCancel(); };

        taxCategoryEditSaveBtn.addEventListener('click', onSave);
        taxCategoryEditCancelBtn.addEventListener('click', onCancel);
        taxCategoryEditModal.addEventListener('click', onOverlay);
      });
    }

    function renderCategoryManagerLists() {
      if (!expenseCategoriesListEl || !incomeCategoriesListEl) return;
      expenseCategoriesListEl.innerHTML = TAX_EXPENSE_CATEGORIES.map(c => `<div style="display:flex; gap:.35rem; align-items:center;"><span style="flex:1;">${escHtml(c)}</span><button type="button" class="btn" data-cat-edit="expense" data-cat-name="${encodeURIComponent(c)}">Edit</button><button type="button" class="btn delete" data-cat-del="expense" data-cat-name="${encodeURIComponent(c)}">Delete</button></div>`).join('');
      incomeCategoriesListEl.innerHTML = TAX_INCOME_CATEGORIES.map(c => `<div style="display:flex; gap:.35rem; align-items:center;"><span style="flex:1;">${escHtml(c)}</span><button type="button" class="btn" data-cat-edit="income" data-cat-name="${encodeURIComponent(c)}">Edit</button><button type="button" class="btn delete" data-cat-del="income" data-cat-name="${encodeURIComponent(c)}">Delete</button></div>`).join('');

      (taxCategoryModal || document).querySelectorAll('[data-cat-edit]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const type = btn.getAttribute('data-cat-edit');
          const oldName = decodeURIComponent(btn.getAttribute('data-cat-name') || '');
          const newName = await openCategoryEditModal(oldName);
          if (!newName || newName === oldName) return;
          const list = type === 'income' ? TAX_INCOME_CATEGORIES : TAX_EXPENSE_CATEGORIES;
          if (list.some(c => c.toLowerCase() === newName.toLowerCase())) {
            openErrorModal('That category name already exists.');
            return;
          }
          const rows = type === 'income' ? (loadedTaxData.income || []) : (loadedTaxData.expenses || []);
          if (rows.some(r => String(r.category || '') === oldName)) {
            openErrorModal(`Can't rename "${oldName}" because records already use it. Reclassify those transactions first.`);
            return;
          }
          if (type === 'income') {
            TAX_INCOME_CATEGORIES = TAX_INCOME_CATEGORIES.map(c => c === oldName ? newName : c);
          } else {
            TAX_EXPENSE_CATEGORIES = TAX_EXPENSE_CATEGORIES.map(c => c === oldName ? newName : c);
          }
          saveCategoryPrefs();
          renderCategoryOptions();
          renderCategoryManagerLists();
          openSuccessModal('Category updated.', 'Category Updated ✅');
        });
      });

      (taxCategoryModal || document).querySelectorAll('[data-cat-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const type = btn.getAttribute('data-cat-del');
          const name = decodeURIComponent(btn.getAttribute('data-cat-name') || '');
          const rows = type === 'income' ? (loadedTaxData.income || []) : (loadedTaxData.expenses || []);
          if (rows.some(r => String(r.category || '') === name)) {
            openErrorModal(`Can't delete "${name}". Reclassify transactions in this category before deleting it.`);
            return;
          }
          const ok = await openConfirmModal(`Delete category "${name}"?`, 'Delete Category?', 'Delete');
          if (!ok) return;
          if (type === 'income') {
            TAX_INCOME_CATEGORIES = TAX_INCOME_CATEGORIES.filter(c => c !== name);
          } else {
            TAX_EXPENSE_CATEGORIES = TAX_EXPENSE_CATEGORIES.filter(c => c !== name);
          }
          saveCategoryPrefs();
          renderCategoryOptions();
          renderCategoryManagerLists();
          openSuccessModal('Category deleted.', 'Category Deleted ✅');
        });
      });
    }

    // ===== Tax Ledger =====
    function formatTaxRowLabel(type, r) {
      const counterparty = type === 'income' ? (r.source || '') : (r.vendor || '');
      const cleanNotes = (r.notes || '').replace(/\s*\[owner-funded\]\s*/ig, ' ').trim();
      return `${r.date} | ${r.category || ''} | ${counterparty} | ${cleanNotes}`;
    }

    async function editTaxRecord(type, r) {
      if (type === 'expense') {
        setTaxEntryMode('expense');
        editingExpenseId = Number(r.id || 0);
        taxExpenseDateEl.value = r.date || '';
        taxExpenseVendorEl.value = r.vendor || '';
        taxExpenseCategoryEl.value = r.category || TAX_EXPENSE_CATEGORIES[0];
        taxExpenseAmountEl.value = ((Number(r.amount_cents || 0))/100).toFixed(2);
        taxExpensePaidViaEl.value = r.paid_via || '';
        if (taxExpenseFundingSourceEl) taxExpenseFundingSourceEl.value = r.funding_source || 'cash_bank';
        taxExpenseNotesEl.value = (r.notes || '').replace(/\s*\[owner-funded\]\s*/ig, ' ').trim();
        taxAddExpenseBtn.style.display = 'none';
        taxUpdateExpenseBtn.style.display = '';
        taxCancelExpenseEditBtn.style.display = '';
        taxExpenseAmountEl.focus();
      } else {
        setTaxEntryMode('income');
        editingIncomeId = Number(r.id || 0);
        taxIncomeDateEl.value = r.date || '';
        taxIncomeSourceEl.value = r.source || '';
        taxIncomeCategoryEl.value = r.category || TAX_INCOME_CATEGORIES[0];
        taxIncomeAmountEl.value = ((Number(r.amount_cents || 0))/100).toFixed(2);
        taxIncomeStripeEl.value = r.stripe_session_id || '';
        taxIncomeNotesEl.value = r.notes || '';
        if (taxIncomeOwnerFundedEl) taxIncomeOwnerFundedEl.checked = Number(r.is_owner_funded || 0) === 1;
        taxAddIncomeBtn.style.display = 'none';
        taxUpdateIncomeBtn.style.display = '';
        taxCancelIncomeEditBtn.style.display = '';
        taxIncomeAmountEl.focus();
      }
    }

    function resetExpenseEditMode() {
      editingExpenseId = null;
      taxAddExpenseBtn.style.display = '';
      taxUpdateExpenseBtn.style.display = 'none';
      taxCancelExpenseEditBtn.style.display = 'none';
    }

    function resetIncomeEditMode() {
      editingIncomeId = null;
      taxAddIncomeBtn.style.display = '';
      taxUpdateIncomeBtn.style.display = 'none';
      taxCancelIncomeEditBtn.style.display = 'none';
    }

    async function deleteTaxRecord(type, r) {
      const amount = (Number(r.amount_cents||0)/100).toFixed(2);
      const confirmed = await openConfirmModal(
        `Delete this ${type} record from ${r.date} for $${amount}? This cannot be undone.`,
        'Delete Record?',
        'Delete'
      );
      if (!confirmed) return false;

      const url = type === 'income' ? TAX_INCOME_DELETE_API_URL : TAX_EXPENSE_DELETE_API_URL;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
        body: JSON.stringify({ id: r.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      return true;
    }

    function setTaxEntryMode(mode) {
      const showExpense = mode === 'expense';
      const showOwnerTransfer = mode === 'owner_transfer';
      const showIncome = mode === 'income';

      if (taxExpensePanel) {
        taxExpensePanel.style.display = showExpense ? 'flex' : 'none';
        taxExpensePanel.classList.toggle('active', showExpense);
        taxExpensePanel.setAttribute('aria-hidden', showExpense ? 'false' : 'true');
      }
      if (taxIncomePanel) {
        taxIncomePanel.style.display = showIncome ? 'flex' : 'none';
        taxIncomePanel.classList.toggle('active', showIncome);
        taxIncomePanel.setAttribute('aria-hidden', showIncome ? 'false' : 'true');
      }

      if (taxOwnerTransferPanel) taxOwnerTransferPanel.style.display = showOwnerTransfer ? '' : 'none';
      if (taxExpenseFields) taxExpenseFields.style.display = showExpense ? '' : 'none';
      if (taxOwnerTransferFields) taxOwnerTransferFields.style.display = showOwnerTransfer ? '' : 'none';
      if (taxIncomeFields) taxIncomeFields.style.display = showIncome ? '' : 'none';
      if (taxMinimizeExpenseBtn) taxMinimizeExpenseBtn.textContent = 'Close';
      if (taxMinimizeOwnerTransferBtn) taxMinimizeOwnerTransferBtn.textContent = 'Minimize';
      if (taxMinimizeIncomeBtn) taxMinimizeIncomeBtn.textContent = 'Close';
      if (taxModeExpenseBtn) taxModeExpenseBtn.classList.toggle('active', showExpense);
      if (taxModeOwnerTransferBtn) taxModeOwnerTransferBtn.classList.toggle('active', showOwnerTransfer);
      if (taxModeIncomeBtn) taxModeIncomeBtn.classList.toggle('active', showIncome);
    }

    function initTaxUiDefaults() {
      const now = nowEtParts();
      const thisYear = Number(now.date.split('-')[0] || new Date().getFullYear());
      const years = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];
      const yearOpts = years.map(y => `<option value="${y}">${y}</option>`).join('');
      taxYearEl.innerHTML = yearOpts;
      if (taxSummaryYearEl) taxSummaryYearEl.innerHTML = yearOpts;
      taxYearEl.value = String(thisYear);
      if (taxSummaryYearEl) taxSummaryYearEl.value = String(thisYear);

      renderCategoryOptions();

      taxExpenseDateEl.value = now.date;
      if (taxOwnerTransferDateEl) taxOwnerTransferDateEl.value = now.date;
      taxIncomeDateEl.value = now.date;
      setTaxEntryMode('none');
    }

    function renderTxList() {
      let filtered = allTxItems;
      if (activeTxFilter !== 'all') {
        filtered = filtered.filter(r => r.type === activeTxFilter);
      }
      const selCat = txCategoryFilterEl.value;
      if (activeTxFilter === 'expense' && selCat) {
        filtered = filtered.filter(r => (r.category || '') === selCat);
      }
      if (!filtered.length) {
        taxListEl.textContent = activeTxFilter === 'all' ? 'No transactions yet.' : `No ${activeTxFilter} entries.`;
        return;
      }
      taxListEl.innerHTML = filtered.map((r) => {
        const receiptBtn = r.receipt_key
          ? `<button type="button" class="btn" data-receipt-key="${escHtml(r.receipt_key)}" style="font-size:0.78rem; padding:0.2rem 0.5rem;">Receipt ↗</button>`
          : `<label class="btn" style="font-size:0.78rem; padding:0.2rem 0.5rem; cursor:pointer;" title="Upload receipt">+ Receipt<input type="file" accept=".pdf,.jpg,.jpeg,.png" class="inline-receipt-input" data-upload-type="${r.type}" data-upload-id="${r.id}" style="display:none;"></label>`;
        return `
        <div class="tax-row" data-type="${r.type}" data-id="${r.id}">
          <span class="type">${r.type.toUpperCase()}</span>
          <span class="desc" title="${escHtml(formatTaxRowLabel(r.type, r))}">${escHtml(formatTaxRowLabel(r.type, r))}</span>
          <span class="amt">$${(Number(r.amount_cents || 0)/100).toFixed(2)}</span>
          <div style="display:flex; gap:.3rem; flex-wrap:wrap;">${receiptBtn}<button type="button" class="btn edit" data-tax-edit="1">Edit</button><button type="button" class="btn delete" data-tax-delete="1">Delete</button></div>
        </div>`;
      }).join('');

      taxListEl.querySelectorAll('[data-receipt-key]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await openTaxReceipt(btn.getAttribute('data-receipt-key'));
          } catch (e) {
            openErrorModal(`Could not open receipt: ${e.message || e}`);
          }
        });
      });

      taxListEl.querySelectorAll('[data-tax-edit="1"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('.tax-row');
          const id = Number(row?.getAttribute('data-id') || 0);
          const type = row?.getAttribute('data-type');
          const sourceList = type === 'income' ? (loadedTaxData.income || []) : (loadedTaxData.expenses || []);
          const record = sourceList.find(x => Number(x.id) === id);
          if (!record) return;
          try {
            await editTaxRecord(type, record);
            openSuccessModal('Record loaded into the form. Make your changes and click Update.', 'Edit Mode Ready ✏️');
          } catch (e) {
            openErrorModal(`Could not open transaction for edit: ${e.message || e}`);
          }
        });
      });

      taxListEl.querySelectorAll('[data-tax-delete="1"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('.tax-row');
          const id = Number(row?.getAttribute('data-id') || 0);
          const type = row?.getAttribute('data-type');
          const sourceList = type === 'income' ? (loadedTaxData.income || []) : (loadedTaxData.expenses || []);
          const record = sourceList.find(x => Number(x.id) === id);
          if (!record) return;
          try {
            const deleted = await deleteTaxRecord(type, record);
            if (!deleted) return;
            await loadTaxTransactions();
            await loadAccountsData();
            openSuccessModal('Transaction deleted successfully.', 'Record Deleted ✅');
          } catch (e) {
            openErrorModal(`Could not delete transaction: ${e.message || e}`);
          }
        });
      });

      taxListEl.querySelectorAll('.inline-receipt-input').forEach((input) => {
        input.addEventListener('change', async () => {
          if (!input.files[0]) return;
          const type = input.getAttribute('data-upload-type');
          const id = input.getAttribute('data-upload-id');
          try {
            await uploadReceipt(type, id, input);
            await loadTaxTransactions();
          } catch (e) {
            openErrorModal(`Receipt upload failed: ${e.message || e}`);
          }
        });
      });
    }

    async function loadTaxTransactions() {
      if (!adminSessionActive) return;
      const year = taxYearEl.value;
      const summaryYear = taxSummaryYearEl?.value || year;
      try {
        const [res, summaryRes] = await Promise.all([
          fetch(`${TAX_TX_API_URL}?year=${encodeURIComponent(year)}&type=all&limit=5000`, {
            headers: { 'X-Admin-Password': adminPassword }
          }),
          fetch(`${TAX_TX_API_URL}?year=${encodeURIComponent(summaryYear)}&type=all&limit=5000`, {
            headers: { 'X-Admin-Password': adminPassword }
          })
        ]);
        const data = await res.json();
        const summaryData = await summaryRes.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (!summaryRes.ok) throw new Error(summaryData.error || 'Failed to load summary');

        const items = [
          ...(data.income || []).map(r => ({ type: 'income', ...r })),
          ...(data.expenses || []).map(r => ({ type: 'expense', ...r }))
        ].sort((a,b) => {
          const ad = String(a.date || '');
          const bd = String(b.date || '');
          if (ad !== bd) return bd.localeCompare(ad);
          return Number(b.id || 0) - Number(a.id || 0);
        });

        const incomeByCategory = new Map();
        const expenseByCategory = new Map();
        let incomeTotal = 0;
        let expenseTotal = 0;

        for (const r of (summaryData.income || [])) {
          const c = r.category || 'Uncategorized';
          const v = Number(r.amount_cents || 0);
          incomeTotal += v;
          incomeByCategory.set(c, (incomeByCategory.get(c) || 0) + v);
        }
        for (const r of (summaryData.expenses || [])) {
          const c = r.category || 'Uncategorized';
          const v = Number(r.amount_cents || 0);
          expenseTotal += v;
          expenseByCategory.set(c, (expenseByCategory.get(c) || 0) + v);
        }

        const sortedIncome = [...incomeByCategory.entries()].sort((a,b) => b[1]-a[1]);
        const sortedExpense = [...expenseByCategory.entries()].sort((a,b) => b[1]-a[1]);

        const incomeRows = sortedIncome.length
          ? sortedIncome.map(([cat, cents]) => `<div class="tax-summary-line"><span>${cat}</span><strong>$${(cents/100).toFixed(2)}</strong></div>`).join('')
          : '<div class="tax-summary-line"><span>No income entries</span><strong>$0.00</strong></div>';

        const expenseRows = sortedExpense.length
          ? sortedExpense.map(([cat, cents]) => `<div class="tax-summary-line"><span>${cat}</span><strong>$${(cents/100).toFixed(2)}</strong></div>`).join('')
          : '<div class="tax-summary-line"><span>No expense entries</span><strong>$0.00</strong></div>';

        taxSummaryListEl.innerHTML = `
          <div class="tax-summary-col">
            <h4>Income (${summaryYear})</h4>
            <div class="tax-summary-line"><span>Total</span><strong>$${(incomeTotal/100).toFixed(2)}</strong></div>
            ${incomeRows}
          </div>
          <div class="tax-summary-col">
            <h4>Expenses (${summaryYear})</h4>
            <div class="tax-summary-line"><span>Total</span><strong>$${(expenseTotal/100).toFixed(2)}</strong></div>
            ${expenseRows}
            <div class="tax-summary-line" style="margin-top:.4rem; border-top:1px solid var(--line); padding-top:.4rem;"><span>Net</span><strong class="money-blur-target">$${((incomeTotal - expenseTotal)/100).toFixed(2)}</strong></div>
          </div>
        `;
        allTxItems = items;
        loadedTaxData = data;
        txCategoryFilterEl.innerHTML = '<option value="">All Categories</option>' +
          TAX_EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
        renderTxList();
        markMoneyBlurTargets();
      } catch (e) {
        taxSummaryListEl.innerHTML = `<div class="tax-summary-col"><h4>Summary</h4><div class="tax-summary-line"><span>Error</span><strong>${(e.message || e)}</strong></div></div>`;
        taxListEl.textContent = `Error loading tax transactions: ${e.message || e}`;
      }
    }

    function clearTaxExpenseForm() {
      const now = nowEtParts();
      taxExpenseDateEl.value = now.date;
      taxExpenseVendorEl.value = '';
      taxExpenseAmountEl.value = '';
      taxExpensePaidViaEl.value = '';
      if (taxExpenseFundingSourceEl) taxExpenseFundingSourceEl.value = 'cash_bank';
      taxExpenseNotesEl.value = '';
      const expReceiptEl = document.getElementById('tax-expense-receipt');
      if (expReceiptEl) expReceiptEl.value = '';
      const expReceiptNameEl = document.getElementById('tax-expense-receipt-name');
      if (expReceiptNameEl) expReceiptNameEl.textContent = 'No file chosen';
      if (taxExpenseCategoryEl.options.length) taxExpenseCategoryEl.selectedIndex = 0;
      resetExpenseEditMode();
    }

    function clearTaxIncomeForm() {
      const now = nowEtParts();
      taxIncomeDateEl.value = now.date;
      taxIncomeSourceEl.value = '';
      taxIncomeAmountEl.value = '';
      taxIncomeStripeEl.value = '';
      taxIncomeNotesEl.value = '';
      if (taxIncomeOwnerFundedEl) taxIncomeOwnerFundedEl.checked = false;
      const incReceiptEl = document.getElementById('tax-income-receipt');
      if (incReceiptEl) incReceiptEl.value = '';
      const incReceiptNameEl = document.getElementById('tax-income-receipt-name');
      if (incReceiptNameEl) incReceiptNameEl.textContent = 'No file chosen';
      if (taxIncomeCategoryEl.options.length) taxIncomeCategoryEl.selectedIndex = 0;
      resetIncomeEditMode();
    }

    async function addTaxExpense() {
      const payload = {
        date: taxExpenseDateEl.value,
        vendor: taxExpenseVendorEl.value.trim(),
        category: taxExpenseCategoryEl.value,
        amount: taxExpenseAmountEl.value,
        paidVia: taxExpensePaidViaEl.value.trim(),
        notes: taxExpenseNotesEl.value.trim(),
        fundingSource: taxExpenseFundingSourceEl ? taxExpenseFundingSourceEl.value : 'cash_bank'
      };
      if (!payload.date || !payload.category || !payload.amount) {
        openErrorModal('Expense date, category, and amount are required.');
        return;
      }
      const isEdit = !!editingExpenseId;
      const proceed = await openConfirmModal(
        isEdit ? 'Save changes to this expense record?' : 'Add this new expense record?',
        isEdit ? 'Update Expense?' : 'Add Expense?',
        isEdit ? 'Update' : 'Add'
      );
      if (!proceed) return;
      try {
        const targetUrl = isEdit ? TAX_EXPENSE_UPDATE_API_URL : TAX_EXPENSE_API_URL;
        if (editingExpenseId) payload.id = editingExpenseId;
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        const receiptInput = document.getElementById('tax-expense-receipt');
        if (data.id && receiptInput) {
          await uploadReceipt('expense', data.id, receiptInput).catch(() => {});
          receiptInput.value = '';
        }
        clearTaxExpenseForm();
        setTaxEntryMode('none');
        await loadTaxTransactions();
        await loadAccountsData();
        openSuccessModal(isEdit ? 'Expense record updated successfully.' : 'Expense record added successfully.', isEdit ? 'Expense Updated ✅' : 'Expense Added ✅');
      } catch (e) {
        openErrorModal(`Could not save expense: ${e.message || e}`);
      }
    }

    function clearTaxOwnerTransferForm() {
      const now = nowEtParts();
      if (taxOwnerTransferDateEl) taxOwnerTransferDateEl.value = now.date;
      if (taxOwnerTransferTypeEl) taxOwnerTransferTypeEl.value = 'personal_to_business';
      if (taxOwnerTransferAmountEl) taxOwnerTransferAmountEl.value = '';
      if (taxOwnerTransferNotesEl) taxOwnerTransferNotesEl.value = '';
    }

    async function addTaxOwnerTransfer() {
      const payload = {
        date: taxOwnerTransferDateEl?.value,
        transferType: taxOwnerTransferTypeEl?.value,
        amount: taxOwnerTransferAmountEl?.value,
        notes: taxOwnerTransferNotesEl?.value?.trim() || ''
      };
      if (!payload.date || !payload.transferType || !payload.amount) {
        openErrorModal('Transfer date, type, and amount are required.');
        return;
      }
      const ok = await openConfirmModal('Add this owner transfer journal entry?', 'Add Owner Transfer?', 'Add');
      if (!ok) return;
      try {
        const res = await fetch(TAX_OWNER_TRANSFER_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        clearTaxOwnerTransferForm();
        closeOwnerTransferModal();
        await loadAccountsData();
        openSuccessModal('Owner transfer posted to journal successfully.', 'Owner Transfer Added ✅');
      } catch (e) {
        openErrorModal(`Could not add owner transfer: ${e.message || e}`);
      }
    }

    async function addTaxIncome() {
      const payload = {
        date: taxIncomeDateEl.value,
        source: taxIncomeSourceEl.value.trim(),
        category: taxIncomeCategoryEl.value,
        amount: taxIncomeAmountEl.value,
        stripeSessionId: taxIncomeStripeEl.value.trim(),
        notes: taxIncomeNotesEl.value.trim(),
        isOwnerFunded: !!taxIncomeOwnerFundedEl?.checked
      };
      if (!payload.date || !payload.category || !payload.amount) {
        openErrorModal('Income date, category, and amount are required.');
        return;
      }
      const isEdit = !!editingIncomeId;
      const proceed = await openConfirmModal(
        isEdit ? 'Save changes to this income record?' : 'Add this new income record?',
        isEdit ? 'Update Income?' : 'Add Income?',
        isEdit ? 'Update' : 'Add'
      );
      if (!proceed) return;
      try {
        const targetUrl = isEdit ? TAX_INCOME_UPDATE_API_URL : TAX_INCOME_API_URL;
        if (editingIncomeId) payload.id = editingIncomeId;
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        const receiptInput = document.getElementById('tax-income-receipt');
        if (data.id && receiptInput) {
          await uploadReceipt('income', data.id, receiptInput).catch(() => {});
          receiptInput.value = '';
        }
        clearTaxIncomeForm();
        setTaxEntryMode('none');
        await loadTaxTransactions();
        await loadAccountsData();
        openSuccessModal(isEdit ? 'Income record updated successfully.' : 'Income record added successfully.', isEdit ? 'Income Updated ✅' : 'Income Added ✅');
      } catch (e) {
        openErrorModal(`Could not save income: ${e.message || e}`);
      }
    }

    async function uploadReceipt(type, id, fileInput) {
      if (!fileInput.files[0]) return;
      const fd = new FormData();
      fd.append('type', type);
      fd.append('id', String(id));
      fd.append('file', fileInput.files[0]);
      const res = await fetch(TAX_RECEIPT_UPLOAD_URL, {
        method: 'POST',
        headers: { 'X-Admin-Password': adminPassword },
        body: fd
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Receipt upload failed');
    }

    async function openTaxReceipt(receiptKey) {
      const res = await fetch(`${TAX_RECEIPT_URL}?key=${encodeURIComponent(receiptKey)}`, {
        headers: { 'X-Admin-Password': adminPassword }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Receipt download failed');
      }
      const blobUrl = URL.createObjectURL(await res.blob());
      window.open(blobUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
    }

    function adminCsvEscape(value) {
      const s = String(value ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }

    function getQuarterRange(year, quarter) {
      const ranges = {
        '1': [`${year}-01-01`, `${year}-03-31`],
        '2': [`${year}-04-01`, `${year}-06-30`],
        '3': [`${year}-07-01`, `${year}-09-30`],
        '4': [`${year}-10-01`, `${year}-12-31`]
      };
      return ranges[quarter] || [`${year}-01-01`, `${year}-12-31`];
    }

    function inDateRange(dateValue, startDate, endDate) {
      const d = String(dateValue || '').slice(0, 10);
      return d >= startDate && d <= endDate;
    }

    function buildTaxCsv(rows) {
      const lines = [];
      lines.push(['date','type','category','vendor_or_source','amount','paid_via','stripe_session_id','notes','created_at'].join(','));
      for (const r of rows) {
        lines.push([
          adminCsvEscape(r.date),
          adminCsvEscape(r.type),
          adminCsvEscape(r.category),
          adminCsvEscape(r.vendor_or_source),
          (Number(r.amount_cents || 0) / 100).toFixed(2),
          adminCsvEscape(r.paid_via || ''),
          adminCsvEscape(r.stripe_session_id || ''),
          adminCsvEscape(r.notes || ''),
          adminCsvEscape(r.created_at || '')
        ].join(','));
      }
      return lines.join('\n');
    }

    async function downloadTaxCsv() {
      const year = taxYearEl.value;
      const type = taxTypeEl.value;
      const quarter = document.getElementById('tax-export-quarter')?.value || 'all';
      const quarterSuffix = quarter && quarter !== 'all' ? `-Q${quarter}` : '';
      try {
        const res = await fetch(`${TAX_TX_API_URL}?year=${encodeURIComponent(year)}&type=all&limit=10000`, {
          headers: { 'X-Admin-Password': adminPassword }
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Export failed');
        }
        const data = await res.json();
        const [startDate, endDate] = getQuarterRange(year, quarter);
        const rows = [
          ...(data.income || []).map(r => ({
            type: 'income',
            date: r.date,
            category: r.category,
            vendor_or_source: r.source || '',
            amount_cents: r.amount_cents,
            paid_via: '',
            stripe_session_id: r.stripe_session_id || '',
            notes: r.notes || '',
            created_at: r.created_at || ''
          })),
          ...(data.expenses || []).map(r => ({
            type: 'expense',
            date: r.date,
            category: r.category,
            vendor_or_source: r.vendor || '',
            amount_cents: r.amount_cents,
            paid_via: r.paid_via || '',
            stripe_session_id: '',
            notes: r.notes || '',
            created_at: r.created_at || ''
          }))
        ]
          .filter(r => type === 'all' || r.type === type)
          .filter(r => inDateRange(r.date, startDate, endDate))
          .sort((a, b) => {
            const ad = String(a.date || '');
            const bd = String(b.date || '');
            if (ad !== bd) return ad.localeCompare(bd);
            return a.type.localeCompare(b.type);
          });
        const blob = new Blob([buildTaxCsv(rows)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eastern-shore-ai-tax-${year}-${type}${quarterSuffix}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) {
        openErrorModal(`Could not export CSV: ${e.message || e}`);
      }
    }

    function initAccountsUiDefaults() {
      const now = nowEtParts();
      const thisYear = Number(now.date.split('-')[0] || new Date().getFullYear());
      const years = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];
      if (accountsYearEl) {
        accountsYearEl.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        accountsYearEl.value = String(thisYear);
      }
      if (auditYearEl) {
        auditYearEl.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        auditYearEl.value = String(thisYear);
      }
      if (reconYearEl) {
        reconYearEl.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        reconYearEl.value = String(thisYear);
      }
      if (accountsFromEl) accountsFromEl.value = `${thisYear}-01-01`;
      if (accountsToEl) accountsToEl.value = `${thisYear}-12-31`;
    }

    function parseCsvRows(text) {
      const lines = (text || '').split(/\r?\n/).filter(Boolean);
      if (!lines.length) return [];
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const idxDate = headers.findIndex(h => h.includes('date'));
      const idxDesc = headers.findIndex(h => h.includes('desc') || h.includes('memo') || h.includes('name'));
      const idxAmt = headers.findIndex(h => h.includes('amount'));
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const rawAmount = cols[idxAmt >= 0 ? idxAmt : 0] || '';
        const amount = Number(String(rawAmount).replace(/[$,]/g, ''));
        if (!Number.isFinite(amount)) continue;
        rows.push({
          date: cols[idxDate >= 0 ? idxDate : 0] || '',
          description: cols[idxDesc >= 0 ? idxDesc : 1] || '',
          amountCents: Math.round(Math.abs(amount) * 100),
          sign: amount >= 0 ? 1 : -1
        });
      }
      return rows;
    }

    async function runReconciliation() {
      if (!reconCsvEl?.files?.[0]) { openErrorModal('Select a CSV file first.'); return; }
      const year = reconYearEl?.value || taxYearEl?.value;
      const month = reconMonthEl?.value || 'all';
      const fileText = await reconCsvEl.files[0].text();
      let statementRows = parseCsvRows(fileText);
      if (!statementRows.length) { openErrorModal('Could not parse statement rows from CSV.'); return; }

      if (month !== 'all') {
        statementRows = statementRows.filter((r) => {
          const d = String(r.date || '').slice(0, 10);
          return /^\d{4}-\d{2}-\d{2}$/.test(d) && d.startsWith(`${year}-${month}`);
        });
      } else {
        statementRows = statementRows.filter((r) => String(r.date || '').startsWith(`${year}-`));
      }
      if (!statementRows.length) { openErrorModal('No statement rows found for the selected period.'); return; }

      const res = await fetch(`${TAX_TX_API_URL}?year=${encodeURIComponent(year)}&type=all&limit=5000`, {
        headers: { 'X-Admin-Password': adminPassword }
      });
      const data = await res.json();
      if (!res.ok) { openErrorModal(data.error || 'Failed to load ledger data.'); return; }

      let ledger = [
        ...(data.expenses || []).map(r => ({ type: 'expense', date: r.date, amountCents: Number(r.amount_cents || 0), label: `${r.category || ''} ${r.vendor || ''}`.trim() })),
        ...(data.income || []).map(r => ({ type: 'income', date: r.date, amountCents: Number(r.amount_cents || 0), label: `${r.category || ''} ${r.source || ''}`.trim() }))
      ];
      if (month !== 'all') {
        ledger = ledger.filter((l) => String(l.date || '').startsWith(`${year}-${month}`));
      }

      const used = new Set();
      let matched = 0;
      const unmatched = [];
      const matchedLines = [];
      for (const s of statementRows) {
        const idx = ledger.findIndex((l, i) => !used.has(i) && l.amountCents === s.amountCents);
        if (idx >= 0) {
          used.add(idx);
          matched++;
          matchedLines.push({ statement: s, ledger: ledger[idx] });
        } else {
          unmatched.push(s);
        }
      }

      const periodLabel = month === 'all' ? `${year} (all months)` : `${year}-${month}`;
      reconSummaryEl.textContent = `Period: ${periodLabel} | Statement rows: ${statementRows.length} | Ledger rows: ${ledger.length} | Matched: ${matched} | Unmatched: ${unmatched.length}`;
      reconMatchesEl.innerHTML = `
        <div><strong>Matched</strong></div>
        ${(matchedLines.slice(0, 120)).map(m => `<div style="padding:.2rem 0; border-bottom:1px dashed var(--line);">${escHtml(m.statement.date)} | ${escHtml(m.statement.description)} | $${(m.statement.amountCents/100).toFixed(2)} ↔ ${escHtml(m.ledger.type)} ${escHtml(m.ledger.label)}</div>`).join('') || '<div style="color:var(--muted);">No matches.</div>'}
        <div style="margin-top:.5rem;"><strong>Unmatched</strong></div>
        ${(unmatched.slice(0, 120)).map(u => `<div style="padding:.2rem 0; border-bottom:1px dashed var(--line);">${escHtml(u.date)} | ${escHtml(u.description)} | $${(u.amountCents/100).toFixed(2)}</div>`).join('') || '<div style="color:var(--muted);">No unmatched rows.</div>'}
      `;
      markMoneyBlurTargets();
    }

    async function loadAccountsData() {
      if (!adminSessionActive) return;
      const year = accountsYearEl?.value || '';
      const from = accountsFromEl?.value || '';
      const to = accountsToEl?.value || '';
      const periodQuery = /^\d{4}$/.test(year)
        ? `year=${encodeURIComponent(year)}`
        : `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

      try {
        const [summaryRes, statementsRes, journalRes] = await Promise.all([
          fetch(`${ACCOUNTS_SUMMARY_API_URL}?${periodQuery}`, { headers: { 'X-Admin-Password': adminPassword } }),
          fetch(`${ACCOUNTS_STATEMENTS_API_URL}?${periodQuery}`, { headers: { 'X-Admin-Password': adminPassword } }),
          fetch(`${ACCOUNTS_JOURNAL_API_URL}?${periodQuery}&limit=200`, { headers: { 'X-Admin-Password': adminPassword } })
        ]);
        const summary = await summaryRes.json();
        const statements = await statementsRes.json();
        const journal = await journalRes.json();
        if (!summaryRes.ok) throw new Error(summary.error || 'Failed to load account summary');
        if (!statementsRes.ok) throw new Error(statements.error || 'Failed to load statements');
        if (!journalRes.ok) throw new Error(journal.error || 'Failed to load journal');

        const groups = { asset: [], liability: [], equity: [], income: [], expense: [] };
        for (const a of (summary.accounts || [])) groups[a.account_type]?.push(a);

        const renderGroup = (title, list) => {
          if (!list.length) return `<div><strong>${title}</strong><div style="color:var(--muted);">No accounts</div></div>`;
          return `<div><strong>${title}</strong>${list.map(a => `<div style="display:flex; justify-content:space-between; gap:.5rem;"><span>${a.code} — ${escHtml(a.name || '')}</span><strong>$${(Number(a.balance_cents || 0)/100).toFixed(2)}</strong></div>`).join('')}</div>`;
        };

        accountsListEl.innerHTML = [
          renderGroup('Assets', groups.asset),
          renderGroup('Liabilities', groups.liability),
          renderGroup('Equity', groups.equity),
          renderGroup('Income', groups.income),
          renderGroup('Expenses', groups.expense)
        ].join('<hr style="border:0; border-top:1px solid var(--line); margin:.6rem 0;" />');

        const t = summary.totals || { debits: 0, credits: 0 };
        if (activeAccountsTab === 'balances') {
          accountsBalanceStatusEl.textContent = summary.balanced
            ? `Trial Balance: Balanced ✅ (Debits $${(t.debits/100).toFixed(2)} = Credits $${(t.credits/100).toFixed(2)})`
            : `Trial Balance: Out of Balance ❌ (Debits $${(t.debits/100).toFixed(2)} vs Credits $${(t.credits/100).toFixed(2)})`;
        }

        const money = (c) => `$${(Number(c || 0)/100).toFixed(2)}`;
        const lineList = (rows = []) => rows.length
          ? rows.map(r => `<div style="display:flex; justify-content:space-between; gap:.5rem;"><span>${r.code} — ${escHtml(r.name || '')}</span><strong>${money(r.balance_cents)}</strong></div>`).join('')
          : '<div style="color:var(--muted);">No rows</div>';

        if (activeAccountsTab === 'balance_sheet') {
          const assets = statements.balanceSheet?.assets || [];
          const liabilities = statements.balanceSheet?.liabilities || [];
          const equity = statements.balanceSheet?.equity || [];
          const totalAssets = Number(statements.totals?.assets || 0);
          const totalLiabilities = Number(statements.totals?.liabilities || 0);
          const totalEquity = Number(statements.totals?.equity || 0);
          const currentEarnings = Number(statements.totals?.income || 0) - Number(statements.totals?.expenses || 0);
          const adjustedEquity = totalEquity + currentEarnings;
          const totalLE = totalLiabilities + adjustedEquity;
          const balancedText = totalAssets === totalLE ? 'Balanced ✅' : 'Out of Balance ❌';

          accountsStatementsListEl.innerHTML = `
            <div class="bs-grid">
              <div class="bs-card">
                <h4>Assets</h4>
                ${lineList(assets)}
                <div class="bs-total"><span>Total Assets</span><span>${money(totalAssets)}</span></div>
              </div>
              <div class="bs-card">
                <h4>Liabilities</h4>
                ${lineList(liabilities)}
                <div class="bs-total"><span>Total Liabilities</span><span>${money(totalLiabilities)}</span></div>
              </div>
              <div class="bs-card">
                <h4>Equity</h4>
                ${lineList(equity)}
                <div class="bs-line"><span>Current Period Earnings</span><strong class="money-blur-target">${money(currentEarnings)}</strong></div>
                <div class="bs-total"><span>Total Equity (Adjusted)</span><span>${money(adjustedEquity)}</span></div>
              </div>
            </div>
            <div class="bs-card" style="margin-top:.6rem;">
              <div class="bs-line"><span>Accounting Equation</span><strong>${balancedText}</strong></div>
              <div class="bs-line"><span>Assets</span><strong>${money(totalAssets)}</strong></div>
              <div class="bs-line"><span>Liabilities + Equity</span><strong>${money(totalLE)}</strong></div>
            </div>
          `;
        } else if (activeAccountsTab === 'pnl') {
          accountsStatementsListEl.innerHTML = `
            <div><strong>Income</strong>${lineList(statements.incomeStatement?.income || [])}</div>
            <hr style="border:0; border-top:1px solid var(--line); margin:.6rem 0;" />
            <div><strong>Expenses</strong>${lineList(statements.incomeStatement?.expenses || [])}</div>
            <hr style="border:0; border-top:1px solid var(--line); margin:.6rem 0;" />
            <div style="display:flex; justify-content:space-between;"><span>Net Income</span><strong class="money-blur-target">${money((Number(statements.totals?.income||0)-Number(statements.totals?.expenses||0)))}</strong></div>
          `;
        } else if (activeAccountsTab === 'cashflow') {
          accountsStatementsListEl.innerHTML = `
            <div><strong>Cash Flow (Direct — Simplified)</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Net Cash Change</span><strong>${money(statements.cashFlow?.netCashChange)}</strong></div>
            <div style="color:var(--muted); margin-top:.4rem;">${escHtml(statements.cashFlow?.note || '')}</div>
          `;
        }

        const entries = journal.entries || [];
        accountsJournalListEl.innerHTML = entries.length
          ? entries.map((e) => {
              const lines = (e.lines || []).map(l => `<div style="display:flex; justify-content:space-between;"><span>${l.code} — ${escHtml(l.name || '')}</span><span>Dr $${(Number(l.debit_cents||0)/100).toFixed(2)} | Cr $${(Number(l.credit_cents||0)/100).toFixed(2)}</span></div>`).join('');
              const inlineNotes = (e.source_notes || '').trim();
              const notePart = inlineNotes ? ` <span style="color:var(--muted);">(${escHtml(inlineNotes)})</span>` : '';
              return `<div style="padding:.45rem 0; border-bottom:1px dashed var(--line);"><div><strong>${e.entry_date}</strong> — ${escHtml(e.memo || '(no memo)')}${notePart}</div>${lines}</div>`;
            }).join('')
          : 'No journal entries for selected period.';
        markMoneyBlurTargets();
      } catch (e) {
        accountsListEl.textContent = `Error loading accounts: ${e.message || e}`;
      }
    }

    function captureInvoiceDraftItems() {
      const rows = Array.from(invoiceLineItemsEl?.querySelectorAll('[data-invoice-line-item-row]') || []);
      if (!rows.length) return;
      invoiceDraftItems = rows.map((row) => ({
        description: (row.querySelector('[data-line-description]')?.value || '').trim(),
        quantity: Number(row.querySelector('[data-line-qty]')?.value || 1) || 1,
        unitAmount: (row.querySelector('[data-line-unit]')?.value || '').trim()
      }));
    }

    function buildInvoiceItemsFromForm() {
      const rows = Array.from(invoiceLineItemsEl?.querySelectorAll('[data-invoice-line-item-row]') || []);
      return rows.map((row) => {
        const description = (row.querySelector('[data-line-description]')?.value || '').trim();
        const qtyRaw = Number(row.querySelector('[data-line-qty]')?.value || 1);
        const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
        const unitRaw = Number(row.querySelector('[data-line-unit]')?.value || 0);
        const unitAmountCents = Number.isFinite(unitRaw) && unitRaw > 0 ? Math.round(unitRaw * 100) : 0;
        return { description: description || 'Service', quantity: qty, unitAmountCents };
      }).filter((item) => item.unitAmountCents > 0 || item.description);
    }

    function renderInvoiceLineItems() {
      if (!invoiceLineItemsEl) return;
      invoiceLineItemsEl.innerHTML = invoiceDraftItems.map((item, index) => `
        <div class="admin-row" data-invoice-line-item-row style="gap:.45rem; margin-bottom:.45rem; align-items:center; flex-wrap:wrap;">
          <input data-line-description value="${escHtml(item.description || '')}" placeholder="Line item description" style="min-width:220px; flex:1;" />
          <input data-line-qty type="number" min="0.01" step="0.01" value="${Number(item.quantity || 1)}" placeholder="Qty" style="max-width:85px;" />
          <input data-line-unit type="number" min="0" step="0.01" value="${item.unitAmount}" placeholder="Unit $" style="max-width:120px;" />
          <button type="button" class="btn" data-remove-line-item="${index}">Remove</button>
        </div>
      `).join('');
      updateInvoiceTotalDisplay();
    }

    function updateInvoiceTotalDisplay() {
      const items = buildInvoiceItemsFromForm();
      const totalCents = items.reduce((sum, item) => sum + Math.round(Number(item.quantity || 1) * Number(item.unitAmountCents || 0)), 0);
      if (invoiceTotalDisplayEl) invoiceTotalDisplayEl.textContent = `$${(totalCents / 100).toFixed(2)}`;
    }

    async function saveQuickInvoice() {
      const customerName = (invoiceCustomerNameEl?.value || '').trim();
      const customerEmail = (invoiceCustomerEmailEl?.value || '').trim();
      const customerPhone = (invoiceCustomerPhoneEl?.value || '').trim();
      const dueDate = invoiceDueDateEl?.value;
      const descriptionOfWork = (invoiceDescriptionEl?.value || '').trim();
      const items = buildInvoiceItemsFromForm();
      const totalCents = items.reduce((sum, item) => sum + Math.round(Number(item.quantity || 1) * Number(item.unitAmountCents || 0)), 0);

      if (!customerName || !dueDate || !customerEmail) {
        openErrorModal('Invoice requires customer name, valid customer email, and due date.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        openErrorModal('Enter a valid customer email address.');
        invoiceCustomerEmailEl?.focus();
        return;
      }
      if (!items.length || totalCents <= 0) {
        openErrorModal('Add at least one line item with an amount.');
        return;
      }

      const isEditing = Number(editingInvoiceId || 0) > 0;
      const payload = {
        customerName,
        customerEmail,
        customerPhone,
        descriptionOfWork,
        dueDate,
        items
      };

      let endpoint = INVOICES_API_URL;
      if (isEditing) {
        endpoint = INVOICE_UPDATE_API_URL;
        payload.id = Number(editingInvoiceId);
      } else {
        payload.issueDate = new Date().toISOString().slice(0, 10);
        payload.invoiceNumber = `INV-${Date.now()}`;
        payload.status = 'draft';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { openErrorModal(data.error || `Failed to ${isEditing ? 'update' : 'create'} invoice`); return; }
      openSuccessModal(
        isEditing ? 'Invoice updated' : 'Invoice created',
        isEditing ? `Invoice #${payload.id} updated.` : `Invoice #${data.invoiceId} created.`
      );
      closeInvoiceCreateModal();
      await refreshInvoiceList();
    }

    async function startInvoiceEdit(id) {
      const invoiceId = Number(id || 0);
      if (!invoiceId) return;
      const res = await fetch(`${INVOICE_DETAIL_API_URL}?id=${encodeURIComponent(invoiceId)}`, {
        headers: { 'X-Admin-Password': adminPassword }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.invoice) {
        openErrorModal(data.error || 'Failed to load invoice details for editing.');
        return;
      }
      const inv = data.invoice;
      editingInvoiceId = invoiceId;
      if (invoiceCustomerNameEl) invoiceCustomerNameEl.value = inv.customer_name || '';
      if (invoiceCustomerEmailEl) invoiceCustomerEmailEl.value = inv.customer_email || '';
      if (invoiceCustomerPhoneEl) invoiceCustomerPhoneEl.value = inv.customer_phone || '';
      if (invoiceDueDateEl) invoiceDueDateEl.value = inv.due_date || '';
      if (invoiceDescriptionEl) invoiceDescriptionEl.value = inv.notes || '';
      invoiceDraftItems = (Array.isArray(inv.line_items) ? inv.line_items : []).map((item) => ({
        description: item.item_description || '',
        quantity: Number(item.quantity || 1),
        unitAmount: (Number(item.unit_amount_cents || 0) / 100).toFixed(2)
      }));
      if (!invoiceDraftItems.length) invoiceDraftItems = [{ description: '', quantity: 1, unitAmount: '' }];
      renderInvoiceLineItems();
      if (invoiceCreateBtn) invoiceCreateBtn.textContent = 'Save Invoice Changes';
      if (invoiceCreateTitleEl) invoiceCreateTitleEl.textContent = 'Edit Invoice';
      openInvoiceCreateModal();
    }

    function invoiceStatusBadge(status) {
      const s = String(status || 'draft').toLowerCase();
      return `<span class="type" style="text-transform:uppercase;">${escHtml(s)}</span>`;
    }

    async function refreshInvoiceList() {
      if (!adminSessionActive) return;
      const prevTxt = invoiceRefreshBtn?.textContent || 'Refresh Invoices';
      if (invoiceRefreshBtn) { invoiceRefreshBtn.disabled = true; invoiceRefreshBtn.classList.add('working'); invoiceRefreshBtn.textContent = 'Refreshing…'; }
      if (invoiceListEl) invoiceListEl.innerHTML = '<div style="color:var(--muted);">Loading invoices…</div>';
      try {
      let status = (invoiceFilterEl?.value || 'all').trim();
      if (status === 'open') status = 'sent';
      const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`${INVOICES_API_URL}${query}`, { headers: { 'X-Admin-Password': adminPassword } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { invoiceListEl.textContent = data.error || 'Failed to load invoices.'; return; }

      const rows = Array.isArray(data.invoices) ? data.invoices : [];
      const filtered = (invoiceFilterEl?.value || 'all') === 'open'
        ? rows.filter((r) => !['paid', 'void'].includes(String(r.status || '').toLowerCase()))
        : rows;

      const sortMode = (invoiceSortEl?.value || 'newest').trim();
      if (sortMode === 'last-name') {
        filtered.sort((a, b) => {
          const la = ((a.customer_name || '').toString().trim().split(/\s+/).pop() || '').toLowerCase();
          const lb = ((b.customer_name || '').toString().trim().split(/\s+/).pop() || '').toLowerCase();
          if (la < lb) return -1;
          if (la > lb) return 1;
          return Number(b.id || 0) - Number(a.id || 0);
        });
      } else if (sortMode === 'status') {
        const rank = { draft: 0, sent: 1, partial: 2, paid: 3, void: 4 };
        filtered.sort((a, b) => {
          const sa = (a.status || 'draft').toString().toLowerCase();
          const sb = (b.status || 'draft').toString().toLowerCase();
          const ra = Number.isFinite(rank[sa]) ? rank[sa] : 99;
          const rb = Number.isFinite(rank[sb]) ? rank[sb] : 99;
          if (ra !== rb) return ra - rb;
          return Number(b.id || 0) - Number(a.id || 0);
        });
      } else {
        filtered.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      }

      if (!filtered.length) {
        invoiceListEl.innerHTML = '<div style="color:var(--muted);">No invoices found for this filter.</div>';
        return;
      }

      invoiceListEl.innerHTML = filtered.map((inv) => {
        const id = Number(inv.id || 0);
        const due = escHtml(inv.due_date || '');
        const issue = escHtml(inv.issue_date || '');
        const customer = escHtml(inv.customer_name || '');
        const num = escHtml(inv.invoice_number || `INV-${id}`);
        const total = `$${(Number(inv.total_cents || 0) / 100).toFixed(2)}`;
        const paid = `$${(Number(inv.amount_paid_cents || 0) / 100).toFixed(2)}`;
        const bal = `$${(Number(inv.balance_due_cents || 0) / 100).toFixed(2)}`;
        const status = String(inv.status || 'draft').toLowerCase();
        const paymentUrl = (inv.stripe_checkout_url || '').toString().trim();
        const hasPaymentUrl = !!paymentUrl;

        return `<div style="padding:.45rem 0; border-bottom:1px dashed var(--line);">
          <div style="display:flex; justify-content:space-between; gap:.5rem; flex-wrap:wrap;">
            <strong>${num}</strong>
            ${invoiceStatusBadge(status)}
          </div>
          <div style="display:flex; justify-content:space-between; gap:.5rem; flex-wrap:wrap; margin-top:.2rem;">
            <span>${customer}${inv.customer_email ? ` • ${escHtml(inv.customer_email)}` : ''}${inv.customer_phone ? ` • ${escHtml(inv.customer_phone)}` : ''}</span>
            <span>Issue: ${issue} | Due: ${due}</span>
          </div>
          ${inv.notes ? `<div style="margin-top:.2rem; color:var(--muted);">${escHtml(inv.notes)}</div>` : ''}
          <div style="display:flex; justify-content:space-between; gap:.5rem; flex-wrap:wrap; margin-top:.2rem;">
            <span>Total: ${total} | Paid: ${paid} | Balance: <strong>${bal}</strong></span>
          </div>
          <div style="margin-top:.25rem; font-size:.86rem; color:var(--muted); word-break:break-all;">
            ${hasPaymentUrl ? `Payment Link: <a href="${escHtml(paymentUrl)}" target="_blank" rel="noopener noreferrer">click here</a>` : 'Payment Link: Not generated yet'}
          </div>
          <div style="display:flex; gap:.4rem; flex-wrap:wrap; margin-top:.35rem;">
            ${['draft','sent','partial'].includes(status) ? `<button type="button" class="btn action-pop invoice-action-btn" data-invoice-action="edit" data-invoice-id="${id}">Edit</button>` : ''}
            ${hasPaymentUrl ? `<button type="button" class="btn action-pop invoice-action-btn" data-invoice-action="copy-payment-link" data-invoice-id="${id}" data-payment-url="${encodeURIComponent(paymentUrl)}">Copy Payment Link</button>` : ''}
            <button type="button" class="btn action-pop invoice-action-btn" data-invoice-action="email" data-invoice-id="${id}">Send Invoice Email</button>
            <button type="button" class="btn action-pop invoice-action-btn" data-invoice-action="sent" data-invoice-id="${id}" title="Updates status to 'sent' without sending an email. Use if you sent the invoice another way.">Mark Sent</button>
            ${status === 'paid' ? `<button type="button" class="btn invoice-action-btn" data-invoice-action="paid" data-invoice-id="${id}" disabled style="opacity:.5; cursor:not-allowed;">Mark Paid</button>` : `<button type="button" class="btn action-pop invoice-action-btn" data-invoice-action="paid" data-invoice-id="${id}">Mark Paid</button>`}
            ${(Number(inv.balance_due_cents || 0) > 0 && status !== 'paid') ? `<button type="button" class="btn action-pop invoice-action-btn" data-invoice-action="payment" data-invoice-id="${id}">Record Payment</button>` : '<span style="font-size:.82rem; color:var(--muted); padding:.45rem .2rem;">Already paid</span>'}
            <button type="button" class="btn action-pop invoice-action-btn" data-invoice-action="payment-link" data-invoice-id="${id}" data-regenerate="${hasPaymentUrl ? '1' : '0'}">${hasPaymentUrl ? 'Refresh Payment Link' : 'Generate Payment Link'}</button>
            <button type="button" class="btn delete invoice-action-btn" data-invoice-action="delete" data-invoice-id="${id}">Delete</button>
          </div>
        </div>`;
      }).join('');
      } finally {
        if (invoiceRefreshBtn) { invoiceRefreshBtn.disabled = false; invoiceRefreshBtn.classList.remove('working'); invoiceRefreshBtn.textContent = prevTxt; }
      }
    }

    async function handleInvoiceActionClick(e) {
      const btn = e.target.closest('[data-invoice-action]');
      if (!btn) return;
      if (btn.hasAttribute('disabled')) return;
      const id = Number(btn.getAttribute('data-invoice-id') || 0);
      const action = btn.getAttribute('data-invoice-action') || '';
      if (!id || !action) return;

      if (action === 'copy-payment-link') {
        const paymentUrl = decodeURIComponent((btn.getAttribute('data-payment-url') || '').trim());
        if (!paymentUrl) { openErrorModal('No payment link found for this invoice yet.'); return; }
        try {
          await navigator.clipboard.writeText(paymentUrl);
          openSuccessModal('Payment link copied', 'Payment link copied to clipboard.');
        } catch {
          prompt('Copy payment link:', paymentUrl);
        }
        return;
      }

      if (action === 'payment-link') {
        const regenerate = btn.getAttribute('data-regenerate') === '1';
        const res = await fetch(INVOICE_PAYMENT_LINK_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({ id, regenerate })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { openErrorModal(data.error || 'Failed to create payment link'); return; }
        openSuccessModal(regenerate ? 'Payment link refreshed' : 'Payment link generated', data.paymentUrl || 'Stripe checkout URL is ready.');
        await refreshInvoiceList();
        return;
      }

      if (action === 'edit') {
        await startInvoiceEdit(id);
        return;
      }

      if (action === 'payment') {
        openInvoicePaymentModal(id);
        return;
      }

      if (action === 'delete') {
        const yes = await openConfirmModal('Delete this invoice permanently?', 'Delete Invoice?', 'Delete');
        if (!yes) return;
        const res = await fetch(INVOICE_DELETE_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({ id })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { openErrorModal((res.status===404 ? 'Delete endpoint not found yet — deploy the worker, then retry.' : (data.error || 'Failed to delete invoice'))); return; }
        await refreshInvoiceList();
        return;
      }

      if (action === 'email') {
        const prevTxt = btn.textContent || 'Send Invoice Email';
        btn.disabled = true;
        btn.classList.add('working');
        btn.textContent = 'Sending…';
        try {
          // Auto-generate payment link before sending so email includes Pay button when balance is due.
          const linkRes = await fetch(INVOICE_PAYMENT_LINK_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
            body: JSON.stringify({ id, regenerate: false })
          });
          const linkData = await linkRes.json().catch(() => ({}));
          if (!linkRes.ok) {
            const msg = String(linkData.error || '');
            const canIgnore = /no balance due/i.test(msg);
            if (!canIgnore) { openErrorModal(linkData.error || 'Failed to prepare payment link before sending email'); return; }
          }

          const res = await fetch(INVOICE_SEND_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
            body: JSON.stringify({ id })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { openErrorModal(data.error || 'Failed to send invoice email'); return; }
          openSuccessModal('Invoice email sent', 'Invoice email delivered to customer and status updated to sent.');
          await refreshInvoiceList();
          return;
        } finally {
          btn.disabled = false;
          btn.classList.remove('working');
          btn.textContent = prevTxt;
        }
      }

      const targetStatus = action === 'paid' ? 'paid' : 'sent';
      const res = await fetch(INVOICE_STATUS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
        body: JSON.stringify({ id, status: targetStatus })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { openErrorModal(data.error || 'Invoice status update failed'); return; }
      await refreshInvoiceList();
    }

    // ===== Quotes Functions =====
    function updateQuoteFabVisibility() {
      if (!quoteFabBtn) return;
      quoteFabBtn.style.display = (activeAdminSectionTab === 'quotes' && adminSessionActive) ? 'flex' : 'none';
    }

    function openQuoteCreateModal() {
      if (!quoteCreateModal) return;
      quoteCreateModal.classList.add('active');
      quoteCreateModal.setAttribute('aria-hidden', 'false');
      if (quoteCreateTitleEl) quoteCreateTitleEl.textContent = editingQuoteId ? 'Edit Quote' : 'Create New Quote';
      if (quoteCreateBtn) quoteCreateBtn.textContent = editingQuoteId ? 'Save Quote' : 'Create Quote';
    }

    function closeQuoteCreateModal() {
      if (!quoteCreateModal) return;
      quoteCreateModal.classList.remove('active');
      quoteCreateModal.setAttribute('aria-hidden', 'true');
      resetQuoteForm();
    }

    function resetQuoteForm() {
      if (quoteDescriptionEl) quoteDescriptionEl.value = '';
      if (quoteCustomerEmailEl) quoteCustomerEmailEl.value = '';
      if (quoteCustomerPhoneEl) quoteCustomerPhoneEl.value = '';
      if (quoteCustomerNameEl) quoteCustomerNameEl.value = '';
      if (quoteValidUntilEl) quoteValidUntilEl.value = '';
      editingQuoteId = null;
      quoteDraftItems = [{ description: 'Services', quantity: 1, unitAmount: '' }];
      renderQuoteLineItems();
    }

    function renderQuoteLineItems() {
      if (!quoteLineItemsEl) return;
      quoteLineItemsEl.innerHTML = quoteDraftItems.map((item, idx) => `
        <div style="display:flex; gap:.4rem; margin-bottom:.35rem; align-items:center; flex-wrap:wrap;" data-quote-line-idx="${idx}">
          <input type="text" placeholder="Description" value="${escHtml(item.description || '')}" style="flex:1.2; min-width:110px;" data-quote-field="description" />
          <input type="number" placeholder="Qty" value="${item.quantity || 1}" style="width:60px;" min="1" data-quote-field="quantity" />
          <input type="number" placeholder="Unit $" value="${item.unitAmount || ''}" style="width:140px;" step="0.01" min="0" data-quote-field="unitAmount" />
          <button type="button" class="btn delete" style="padding:.35rem .6rem;" data-quote-remove-line="${idx}">×</button>
        </div>
      `).join('');
      updateQuoteTotal();
    }

    function updateQuoteTotal() {
      const total = quoteDraftItems.reduce((sum, item) => {
        const qty = Number(item.quantity || 1);
        const unit = Number(item.unitAmount || 0);
        return sum + qty * unit;
      }, 0);
      if (quoteTotalDisplayEl) quoteTotalDisplayEl.textContent = `$${total.toFixed(2)}`;
    }

    function buildQuoteItemsFromForm() {
      return quoteDraftItems.map((item) => ({
        description: (item.description || 'Service').toString().trim(),
        quantity: Number(item.quantity || 1),
        unitAmountCents: Math.round(Number(item.unitAmount || 0) * 100)
      }));
    }

    async function saveQuote() {
      const customerName = (quoteCustomerNameEl?.value || '').trim();
      const customerEmail = (quoteCustomerEmailEl?.value || '').trim();
      const customerPhone = (quoteCustomerPhoneEl?.value || '').trim();
      let validUntil = quoteValidUntilEl?.value;
      if (!validUntil) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        validUntil = d.toISOString().slice(0, 10);
      }
      const descriptionOfWork = (quoteDescriptionEl?.value || '').trim();
      const items = buildQuoteItemsFromForm();
      const totalCents = items.reduce((sum, item) => sum + Math.round(Number(item.quantity || 1) * Number(item.unitAmountCents || 0)), 0);

      if (!customerName) { openErrorModal('Customer name is required.'); return; }
      if (!customerEmail) { openErrorModal('Customer email is required.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) { openErrorModal('Enter a valid customer email address.'); quoteCustomerEmailEl?.focus(); return; }
      if (!items.length || totalCents <= 0) { openErrorModal('At least one line item with a valid amount is required.'); return; }

      const isEditing = !!editingQuoteId;
      const payload = { customerName, customerEmail, customerPhone, validUntil, descriptionOfWork, items };
      let endpoint = QUOTES_API_URL;
      if (isEditing) {
        endpoint = QUOTE_UPDATE_API_URL;
        payload.id = Number(editingQuoteId);
      } else {
        payload.quoteNumber = `Q-${Date.now()}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { openErrorModal(data.error || 'Failed to save quote'); return; }

      closeQuoteCreateModal();
      await refreshQuoteList();
      openSuccessModal(isEditing ? 'Quote updated' : 'Quote created', `Quote ${isEditing ? 'updated' : 'created'} successfully.`);
    }

    async function startQuoteEdit(quoteId) {
      const res = await fetch(`${QUOTE_DETAIL_API_URL}?id=${quoteId}`, { headers: { 'X-Admin-Password': adminPassword } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.quote) { openErrorModal(data.error || 'Failed to load quote'); return; }
      const q = data.quote;
      editingQuoteId = quoteId;
      if (quoteCustomerNameEl) quoteCustomerNameEl.value = q.customer_name || '';
      if (quoteCustomerEmailEl) quoteCustomerEmailEl.value = q.customer_email || '';
      if (quoteCustomerPhoneEl) quoteCustomerPhoneEl.value = q.customer_phone || '';
      if (quoteValidUntilEl) quoteValidUntilEl.value = q.valid_until || '';
      if (quoteDescriptionEl) quoteDescriptionEl.value = q.notes || '';
      quoteDraftItems = (Array.isArray(q.line_items) ? q.line_items : []).map((item) => ({
        description: item.item_description || '',
        quantity: Number(item.quantity || 1),
        unitAmount: (Number(item.unit_amount_cents || 0) / 100).toFixed(2)
      }));
      if (!quoteDraftItems.length) quoteDraftItems = [{ description: 'Services', quantity: 1, unitAmount: '' }];
      renderQuoteLineItems();
      openQuoteCreateModal();
    }

    function quoteStatusBadge(status) {
      const colors = { draft: '#6b7280', sent: '#2563eb', accepted: '#059669', expired: '#dc2626', denied: '#7c3aed' };
      const bg = colors[status] || '#6b7280';
      return `<span style="font-size:.78rem; padding:2px 8px; border-radius:999px; background:${bg}; color:#fff; text-transform:uppercase;">${status}</span>`;
    }

    async function refreshQuoteList() {
      if (!adminSessionActive) return;
      const prevTxt = quoteRefreshBtn?.textContent || 'Refresh Quotes';
      if (quoteRefreshBtn) { quoteRefreshBtn.disabled = true; quoteRefreshBtn.classList.add('working'); quoteRefreshBtn.textContent = 'Refreshing…'; }
      if (quoteListEl) quoteListEl.innerHTML = '<div style="color:var(--muted);">Loading quotes…</div>';
      try {
      let status = (quoteFilterEl?.value || 'all').trim();
      const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`${QUOTES_API_URL}${query}`, { headers: { 'X-Admin-Password': adminPassword } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { quoteListEl.textContent = data.error || 'Failed to load quotes.'; return; }

      const rows = Array.isArray(data.quotes) ? data.quotes : [];
      const sortMode = (quoteSortEl?.value || 'newest').trim();
      if (sortMode === 'last-name') {
        rows.sort((a, b) => {
          const la = ((a.customer_name || '').toString().trim().split(/\s+/).pop() || '').toLowerCase();
          const lb = ((b.customer_name || '').toString().trim().split(/\s+/).pop() || '').toLowerCase();
          if (la < lb) return -1;
          if (la > lb) return 1;
          return Number(b.id || 0) - Number(a.id || 0);
        });
      } else if (sortMode === 'status') {
        const rank = { draft: 0, sent: 1, accepted: 2, denied: 3, expired: 4 };
        rows.sort((a, b) => {
          const sa = (a.status || 'draft').toString().toLowerCase();
          const sb = (b.status || 'draft').toString().toLowerCase();
          const ra = Number.isFinite(rank[sa]) ? rank[sa] : 99;
          const rb = Number.isFinite(rank[sb]) ? rank[sb] : 99;
          if (ra !== rb) return ra - rb;
          return Number(b.id || 0) - Number(a.id || 0);
        });
      } else {
        rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      }
      if (!rows.length) {
        quoteListEl.innerHTML = '<div style="color:var(--muted);">No quotes found for this filter.</div>';
        return;
      }

      quoteListEl.innerHTML = rows.map((q) => {
        const id = Number(q.id || 0);
        const validUntil = escHtml(q.valid_until || '');
        const customer = escHtml(q.customer_name || '');
        const num = escHtml(q.quote_number || `Q-${id}`);
        const total = `$${(Number(q.total_cents || 0) / 100).toFixed(2)}`;
        const status = String(q.status || 'draft').toLowerCase();
        const isExpired = new Date(q.valid_until) < new Date();
        const displayStatus = isExpired && !['accepted', 'denied'].includes(status) ? 'expired' : status;

        return `<div style="padding:.45rem 0; border-bottom:1px dashed var(--line);">
          <div style="display:flex; justify-content:space-between; gap:.5rem; flex-wrap:wrap;">
            <strong>${num}</strong>
            ${quoteStatusBadge(displayStatus)}
          </div>
          <div style="display:flex; justify-content:space-between; gap:.5rem; flex-wrap:wrap; margin-top:.2rem;">
            <span>${customer}${q.customer_email ? ` • ${escHtml(q.customer_email)}` : ''}${q.customer_phone ? ` • ${escHtml(q.customer_phone)}` : ''}</span>
            <span>Valid Until: ${validUntil}</span>
          </div>
          ${q.notes ? `<div style="margin-top:.2rem; color:var(--muted);">${escHtml(q.notes)}</div>` : ''}
          <div style="display:flex; justify-content:space-between; gap:.5rem; flex-wrap:wrap; margin-top:.2rem;">
            <span>Total: <strong>${total}</strong></span>
          </div>
          <div style="display:flex; gap:.4rem; flex-wrap:wrap; margin-top:.35rem;">
            ${['draft','sent'].includes(status) && !isExpired ? `<button type="button" class="btn action-pop" data-quote-action="edit" data-quote-id="${id}">Edit</button>` : ''}
            ${['draft','sent'].includes(status) && !isExpired ? `<button type="button" class="btn action-pop" data-quote-action="send" data-quote-id="${id}">Send Quote Email</button>` : ''}
            ${['draft','sent','denied'].includes(status) ? `<button type="button" class="btn action-pop" data-quote-action="convert" data-quote-id="${id}">Convert to Invoice</button>` : ''}
            <button type="button" class="btn delete" data-quote-action="delete" data-quote-id="${id}">Delete</button>
          </div>
        </div>`;
      }).join('');
      } finally {
        if (quoteRefreshBtn) { quoteRefreshBtn.disabled = false; quoteRefreshBtn.classList.remove('working'); quoteRefreshBtn.textContent = prevTxt; }
      }
    }

    async function handleQuoteActionClick(e) {
      const btn = e.target.closest('[data-quote-action]');
      if (!btn) return;
      const id = Number(btn.getAttribute('data-quote-id') || 0);
      const action = btn.getAttribute('data-quote-action') || '';
      if (!id || !action) return;

      if (action === 'edit') {
        await startQuoteEdit(id);
        return;
      }

      if (action === 'send') {
        const res = await fetch(QUOTE_SEND_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({ id })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { openErrorModal(data.error || 'Failed to send quote email'); return; }
        openSuccessModal('Quote email sent', 'Quote email with Accept/Deny links sent to customer.');
        await refreshQuoteList();
        return;
      }

      if (action === 'delete') {
        const ok = await openConfirmModal('Are you sure you want to delete this quote?', 'Delete Quote?', 'Delete');
        if (!ok) return;
        const res = await fetch(QUOTE_DELETE_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({ id })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { openErrorModal(data.error || 'Failed to delete quote'); return; }
        await refreshQuoteList();
        return;
      }
    }

    // Quote line items event handlers
    if (quoteLineItemsEl) {
      quoteLineItemsEl.addEventListener('input', (e) => {
        const lineEl = e.target.closest('[data-quote-line-idx]');
        if (!lineEl) return;
        const idx = Number(lineEl.getAttribute('data-quote-line-idx'));
        const field = e.target.getAttribute('data-quote-field');
        if (field && quoteDraftItems[idx]) {
          quoteDraftItems[idx][field] = e.target.value;
          updateQuoteTotal();
        }
      });
      quoteLineItemsEl.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[data-quote-remove-line]');
        if (!removeBtn) return;
        const idx = Number(removeBtn.getAttribute('data-quote-remove-line'));
        quoteDraftItems.splice(idx, 1);
        if (!quoteDraftItems.length) quoteDraftItems = [{ description: 'Services', quantity: 1, unitAmount: '' }];
        renderQuoteLineItems();
      });
    }

    if (quoteAddLineItemBtn) {
      quoteAddLineItemBtn.addEventListener('click', () => {
        quoteDraftItems.push({ description: '', quantity: 1, unitAmount: '' });
        renderQuoteLineItems();
      });
    }

    if (quoteCreateBtn) quoteCreateBtn.addEventListener('click', saveQuote);
    if (quoteCreateCancelBtn) quoteCreateCancelBtn.addEventListener('click', closeQuoteCreateModal);
    if (quoteFabBtn) quoteFabBtn.addEventListener('click', () => { resetQuoteForm(); openQuoteCreateModal(); });
    if (quoteModeAddBtn) quoteModeAddBtn.addEventListener('click', () => { resetQuoteForm(); openQuoteCreateModal(); });
    if (quoteModeViewBtn) quoteModeViewBtn.addEventListener('click', refreshQuoteList);
    if (quoteRefreshBtn) quoteRefreshBtn.addEventListener('click', refreshQuoteList);
    if (quoteFilterEl) quoteFilterEl.addEventListener('change', refreshQuoteList);
    if (quoteListEl) quoteListEl.addEventListener('click', handleQuoteActionClick);

    // Quote mode toggle buttons
    [quoteModeViewBtn, quoteModeAddBtn].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-quote-mode') || 'view';
        activeQuoteMode = mode;
        quoteModeViewBtn?.classList.toggle('active', mode === 'view');
        quoteModeAddBtn?.classList.toggle('active', mode === 'add');
        if (mode === 'add') { resetQuoteForm(); openQuoteCreateModal(); }
      });
    });

    function setAccountsTab(tab) {
      activeAccountsTab = tab;
      accountsTabBalancesBtn?.classList.toggle('active', tab === 'balances');
      accountsTabBalanceSheetBtn?.classList.toggle('active', tab === 'balance_sheet');
      accountsTabPnlBtn?.classList.toggle('active', tab === 'pnl');
      accountsTabCashflowBtn?.classList.toggle('active', tab === 'cashflow');
      accountsTabJournalBtn?.classList.toggle('active', tab === 'journal');
      if (accountsListEl) accountsListEl.style.display = tab === 'balances' ? '' : 'none';
      if (accountsStatementsListEl) accountsStatementsListEl.style.display = ['balance_sheet','pnl','cashflow'].includes(tab) ? '' : 'none';
      if (accountsJournalListEl) accountsJournalListEl.style.display = tab === 'journal' ? '' : 'none';
      if (tab === 'balances') accountsBalanceStatusEl.textContent = accountsBalanceStatusEl.textContent.replace('Statement View — ', '');
      else if (tab === 'balance_sheet') accountsBalanceStatusEl.textContent = 'Statement View — Balance Sheet';
      else if (tab === 'pnl') accountsBalanceStatusEl.textContent = 'Statement View — Profit & Loss';
      else if (tab === 'cashflow') accountsBalanceStatusEl.textContent = 'Statement View — Cash Flow';
      else if (tab === 'journal') accountsBalanceStatusEl.textContent = 'Statement View — Journal';
      if (adminSessionActive) loadAccountsData();
    }

    function orderStatusBadge(status) {
      const s = String(status || 'new').toLowerCase();
      const colors = { new: '#ff4fd8', acknowledged: '#00e5ff', shipped: '#22c55e', delivered: '#6366f1', reviewed: '#f59e0b' };
      return `<span style="font-size:.78rem; padding:2px 8px; border-radius:999px; background:${colors[s] || '#475569'}; color:#fff; text-transform:uppercase;">${escHtml(s)}</span>`;
    }

    async function refreshOrderList() {
      if (!adminSessionActive) return;
      const prevTxt = orderRefreshBtn?.textContent || 'Refresh Orders';
      if (orderRefreshBtn) { orderRefreshBtn.disabled = true; orderRefreshBtn.classList.add('working'); orderRefreshBtn.textContent = 'Refreshing…'; }
      if (orderListEl) orderListEl.innerHTML = '<div style="color:var(--muted);">Loading orders…</div>';
      try {
        const status = (orderFilterEl?.value || 'all').trim();
        const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
        const res = await fetch(`${ORDERS_API_URL}${query}`, { headers: { 'X-Admin-Password': adminPassword } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { orderListEl.textContent = data.error || 'Failed to load orders.'; return; }
        const rows = Array.isArray(data.orders) ? data.orders : [];
        if (!rows.length) { orderListEl.innerHTML = '<div style="color:var(--muted);">No orders found for this filter.</div>'; return; }
        orderListEl.innerHTML = rows.map((order) => {
          const id = Number(order.id || 0);
          const orderKey = escHtml(order.order_key || `booking:${id}`);
          const statusBadge = orderStatusBadge(order.fulfillment_status || 'new');
          const amount = `$${(Number(order.amount_cents || 0) / 100).toFixed(2)}`;
          const trackingProvider = (order.tracking_provider || '').toString().trim();
          const tracking = (order.tracking_number || '').toString().trim();
          const ackSent = !!(order.ack_email_sent_at || '').toString().trim();
          const shippingSent = !!(order.shipping_email_sent_at || '').toString().trim();
          const deliveredSent = !!(order.delivered_email_sent_at || '').toString().trim();
          const reviewSent = !!(order.review_email_sent_at || '').toString().trim();
          return `<div style="padding:.45rem 0; border-bottom:1px dashed var(--line);">
            <div style="display:flex; justify-content:space-between; gap:.5rem; flex-wrap:wrap;">
              <strong>${escHtml(order.order_summary || 'Order')}</strong>
              ${statusBadge}
            </div>
            <div style="display:flex; justify-content:space-between; gap:.5rem; flex-wrap:wrap; margin-top:.2rem;">
              <span>${escHtml(order.customer_name || '')}${order.customer_email ? ` • ${escHtml(order.customer_email)}` : ''}${order.order_number ? ` • Order #${escHtml(order.order_number)}` : ''}</span>
              <span>${escHtml(order.payment_date || '')} • ${amount}</span>
            </div>
            <div style="margin-top:.2rem; color:var(--muted);">${order.order_source === 'manual' ? `Payment Method: ${escHtml(order.payment_method || 'Not entered')}` : `Stripe: ${escHtml(order.stripe_session_id || '—')}`}</div>
            <div style="margin-top:.2rem; color:var(--muted);">Ack: ${escHtml(formatEtTimestamp(order.ack_email_sent_at))} • Shipped: ${escHtml(formatEtTimestamp(order.shipping_email_sent_at))} • Delivered: ${escHtml(formatEtTimestamp(order.delivered_email_sent_at))} • Review: ${escHtml(formatEtTimestamp(order.review_email_sent_at))}</div>
            <div style="margin-top:.2rem; color:var(--muted);">Tracking: ${tracking ? `${trackingProvider ? `${escHtml(trackingProvider)} • ` : ''}${escHtml(tracking)}` : 'Not added yet'}</div>
            <div style="display:flex; gap:.4rem; flex-wrap:wrap; margin-top:.35rem;">
              <button type="button" class="btn action-pop order-action-btn" data-order-action="ack" data-order-id="${id}" data-order-key="${orderKey}" data-order-summary="${escHtml(order.order_summary || '')}" data-order-amount="${escHtml(amount)}" data-order-payment-date="${escHtml(order.payment_date || '')}" ${ackSent ? 'disabled title="Acknowledgment email already sent"' : ''}>${ackSent ? 'Acknowledgment Sent' : 'Preview Acknowledgment'}</button>
              <button type="button" class="btn action-pop order-action-btn" data-order-action="tracking" data-order-id="${id}" data-order-key="${orderKey}" data-order-summary="${escHtml(order.order_summary || '')}" data-order-amount="${escHtml(amount)}" data-order-payment-date="${escHtml(order.payment_date || '')}" data-tracking-provider="${escHtml(order.tracking_provider || '')}" data-tracking-number="${escHtml(order.tracking_number || '')}" data-tracking-url="${escHtml(order.tracking_url || '')}">Add/Edit Tracking</button>
              <button type="button" class="btn action-pop order-action-btn" data-order-action="battery-test" data-order-id="${id}" data-order-key="${orderKey}" data-battery-note="${escHtml(order.battery_test_note || '')}" data-battery-has-image="${order.battery_test_image_key ? '1' : ''}">${order.battery_test_note || order.battery_test_image_key ? 'Battery Test ✓' : 'Add Battery Test'}</button>
              <button type="button" class="btn action-pop order-action-btn" data-order-action="shipping" data-order-id="${id}" data-order-key="${orderKey}" data-order-summary="${escHtml(order.order_summary || '')}" data-order-amount="${escHtml(amount)}" data-order-payment-date="${escHtml(order.payment_date || '')}" data-tracking-provider="${escHtml(order.tracking_provider || '')}" data-tracking-number="${escHtml(order.tracking_number || '')}" data-tracking-url="${escHtml(order.tracking_url || '')}" ${shippingSent ? 'disabled title="Shipping email already sent"' : `title="${tracking ? 'Preview shipping email' : 'Add tracking first'}"`}>${shippingSent ? 'Shipping Sent' : 'Preview Shipping Email'}</button>
              <button type="button" class="btn action-pop order-action-btn" data-order-action="delivered" data-order-id="${id}" data-order-key="${orderKey}" data-order-summary="${escHtml(order.order_summary || '')}" data-order-amount="${escHtml(amount)}" data-order-payment-date="${escHtml(order.payment_date || '')}" data-tracking-provider="${escHtml(order.tracking_provider || '')}" data-tracking-number="${escHtml(order.tracking_number || '')}" data-tracking-url="${escHtml(order.tracking_url || '')}" ${deliveredSent ? 'disabled title="Delivered email already sent"' : `title="${tracking ? 'Preview delivered email' : 'Add tracking first'}"`}>${deliveredSent ? 'Delivered Sent' : 'Preview Delivered Email'}</button>
              <button type="button" class="btn action-pop order-action-btn" data-order-action="review" data-order-id="${id}" data-order-key="${orderKey}" data-order-summary="${escHtml(order.order_summary || '')}" data-order-amount="${escHtml(amount)}" data-order-payment-date="${escHtml(order.payment_date || '')}" data-shipping-sent="${shippingSent ? '1' : ''}" data-delivered-sent="${deliveredSent ? '1' : ''}" ${reviewSent ? 'disabled title="Review email already sent"' : deliveredSent ? 'title="Preview review email"' : 'aria-disabled="true" title="Send shipping and delivered emails first"'}>${reviewSent ? 'Review Sent' : 'Preview Review Email'}</button>
              ${order.order_source === 'manual' ? `<button type="button" class="btn delete order-action-btn" data-order-action="delete" data-order-id="${id}" data-order-key="${orderKey}">Delete</button>` : '<span style="font-size:.82rem; color:var(--muted); padding:.45rem .2rem;">Stripe order — cannot delete</span>'}
            </div>
          </div>`;
        }).join('');
      } finally {
        if (orderRefreshBtn) { orderRefreshBtn.disabled = false; orderRefreshBtn.classList.remove('working'); orderRefreshBtn.textContent = prevTxt; }
      }
    }

    async function openOrderEmailDraft(id, kind, orderKey = '', meta = {}) {
      try {
        const res = await fetch(ORDER_PREVIEW_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({
            bookingId: id,
            orderKey,
            kind,
            trackingProvider: meta.trackingProvider || '',
            trackingNumber: meta.trackingNumber || '',
            trackingUrl: meta.trackingUrl || ''
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { openErrorModal(data.error || 'Failed to prepare order email preview'); return; }
        openOrderEmailModal({ bookingId: id, orderKey, kind, orderNumber: data.orderNumber || '', orderSummary: meta.orderSummary || '', amountDisplay: meta.amountDisplay || '', paymentDate: meta.paymentDate || '', subject: data.subject || '', bodyText: data.bodyText || '', trackingProvider: data.trackingProvider || meta.trackingProvider || '', trackingNumber: data.trackingNumber || meta.trackingNumber || '', trackingUrl: data.trackingUrl || meta.trackingUrl || '', batteryTestNote: data.batteryTestNote || '', batteryTestImageKey: data.batteryTestImageKey || '' });
      } catch (err) {
        openErrorModal(err?.message || 'Failed to prepare order email preview');
      }
    }

    async function handleOrderActionClick(e) {
      const btn = e.target.closest('[data-order-action]');
      if (!btn) return;
      const id = Number(btn.getAttribute('data-order-id') || 0);
      const orderKey = btn.getAttribute('data-order-key') || '';
      const action = btn.getAttribute('data-order-action') || '';
      const meta = {
        orderSummary: btn.getAttribute('data-order-summary') || '',
        amountDisplay: btn.getAttribute('data-order-amount') || '',
        paymentDate: btn.getAttribute('data-order-payment-date') || '',
        trackingProvider: btn.getAttribute('data-tracking-provider') || '',
        trackingNumber: btn.getAttribute('data-tracking-number') || '',
        trackingUrl: btn.getAttribute('data-tracking-url') || ''
      };
      if ((!id && !orderKey) || !action) return;
      if (action === 'delete') {
        if (!String(orderKey).startsWith('manual:')) { openErrorModal('Only manual orders can be deleted.'); return; }
        const ok = await openConfirmModal('Delete this manual order permanently?', 'Delete Manual Order?', 'Delete');
        if (!ok) return;
        const res = await fetch(ORDER_DELETE_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({ orderKey, id })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { openErrorModal(data.error || 'Failed to delete manual order'); return; }
        openSuccessModal('Manual order deleted.', 'Order Deleted ✅');
        await refreshOrderList();
        return;
      }
      if (action === 'tracking') {
        openTrackingModal({
          bookingId: id,
          orderKey,
          trackingProvider: btn.getAttribute('data-tracking-provider') || '',
          trackingNumber: btn.getAttribute('data-tracking-number') || '',
          trackingUrl: btn.getAttribute('data-tracking-url') || '',
          forShippingEmail: false
        });
        return;
      }
      if (action === 'battery-test') {
        openBatteryTestModal(
          id,
          orderKey,
          btn.getAttribute('data-battery-note') || '',
          btn.getAttribute('data-battery-has-image') === '1'
        );
        return;
      }
      if (action === 'shipping' || action === 'delivered') {
        const trackingNumber = btn.getAttribute('data-tracking-number') || '';
        if (!(trackingNumber || '').trim()) {
          openErrorModal(`Add tracking first, then preview the ${action === 'delivered' ? 'delivered' : 'shipping'} email.`);
          return;
        }
        await openOrderEmailDraft(id, action, orderKey, meta);
        return;
      }
      if (action === 'review') {
        const shippingSent = btn.getAttribute('data-shipping-sent') === '1';
        const deliveredSent = btn.getAttribute('data-delivered-sent') === '1';
        if (!deliveredSent) {
          openErrorModal(shippingSent
            ? 'Send the delivered email before previewing the review request.'
            : 'Send the shipping and delivered emails before previewing the review request.');
          return;
        }
        await openOrderEmailDraft(id, action, orderKey, meta);
        return;
      }
      await openOrderEmailDraft(id, action, orderKey, meta);
    }

    function setAdminSectionTab(tab) {
      activeAdminSectionTab = tab;
      adminSectionTabBtns.forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-admin-tab') === tab));
      const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
      show('booking-controls-card', tab === 'booking');
      show('tax-ledger-card', tab === 'tax');
      show('orders-card', tab === 'orders');
      show('accounts-card', tab === 'accounts');
      show('reconciliation-card', tab === 'reconciliation');
      show('invoices-card', tab === 'invoices');
      show('quotes-card', tab === 'quotes');
      show('year-close-card', tab === 'year-close');
      show('audit-package-card', tab === 'audit-package');
      if (tab === 'orders' && adminSessionActive) refreshOrderList();
      if (tab === 'invoices' && adminSessionActive) refreshInvoiceList();
      if (tab === 'quotes' && adminSessionActive) refreshQuoteList();
      updateInvoiceFabVisibility();
      updateQuoteFabVisibility();
    }

    function disableLegacyCollapse() {
      [bookingCollapseBtn, taxCollapseBtn, ordersCollapseBtn, accountsCollapseBtn, reconciliationCollapseBtn, invoicesCollapseBtn, quotesCollapseBtn, yearCloseCollapseBtn, auditPackageCollapseBtn].forEach((btn) => {
        if (btn) btn.style.display = 'none';
      });
      [bookingControlsBody, taxLedgerBody, ordersBody, accountsBody, reconciliationBody, invoicesBody, quotesBody, yearCloseBody, auditPackageBody].forEach((body) => {
        body?.classList.remove('admin-collapsible-body-collapsed');
      });
    }

    adminSectionTabBtns.forEach((btn) => btn.addEventListener('click', () => setAdminSectionTab(btn.getAttribute('data-admin-tab'))));

    // ===== Admin Unlock =====
    const ADMIN_LOGIN_GUARD_KEY = 'eastern_admin_login_guard_v3';
    const ADMIN_LOGIN_LEGACY_GUARD_KEYS = ['eastern_admin_login_guard_v1', 'eastern_admin_login_guard_v2'];
    const ADMIN_AUTH_SESSION_KEY = 'eastern_admin_auth_session_v1';
    const ADMIN_MAX_TRIES = 3;
    const ADMIN_TRY_WINDOW_MS = 5 * 60 * 1000;
    const ADMIN_LOCK_MS = 60 * 60 * 1000;

    try {
      for (const key of ADMIN_LOGIN_LEGACY_GUARD_KEYS) sessionStorage.removeItem(key);
      localStorage.removeItem(ADMIN_LOGIN_GUARD_KEY);
      if (new URLSearchParams(window.location.search).has('reset-admin-login')) {
        sessionStorage.removeItem(ADMIN_LOGIN_GUARD_KEY);
      }
    } catch {}

    function getAdminLoginGuard() {
      try {
        const raw = sessionStorage.getItem(ADMIN_LOGIN_GUARD_KEY);
        if (!raw) return { attempts: [], lockedUntil: 0 };
        const parsed = JSON.parse(raw);
        return {
          attempts: Array.isArray(parsed?.attempts) ? parsed.attempts : [],
          lockedUntil: Number(parsed?.lockedUntil || 0)
        };
      } catch {
        return { attempts: [], lockedUntil: 0 };
      }
    }

    function setAdminLoginGuard(state) {
      try { sessionStorage.setItem(ADMIN_LOGIN_GUARD_KEY, JSON.stringify(state)); } catch {}
    }

    function clearAdminLoginGuard() {
      try { sessionStorage.removeItem(ADMIN_LOGIN_GUARD_KEY); } catch {}
    }

    function setAdminAuthenticatedSession(on) {
      try {
        if (on) {
          sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, JSON.stringify({ isAuthenticated: true }));
        } else {
          sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
        }
      } catch {}
    }

    function clearAdminAuthenticatedSession() {
      setAdminAuthenticatedSession(false);
    }

    function recordFailedAdminAttempt() {
      const now = Date.now();
      const state = getAdminLoginGuard();
      const attempts = [...state.attempts, now].filter((ts) => now - Number(ts || 0) <= ADMIN_TRY_WINDOW_MS);
      let lockedUntil = Number(state.lockedUntil || 0);
      if (attempts.length > ADMIN_MAX_TRIES) {
        lockedUntil = now + ADMIN_LOCK_MS;
      }
      const next = { attempts, lockedUntil };
      setAdminLoginGuard(next);
      return next;
    }

    function armAdminPasswordClearTimer() {
      clearTimeout(adminInactivityTimer);
      adminInactivityTimer = setTimeout(() => {
        if (adminPassword) {
          removeAdminControls();
          openErrorModal('Admin session expired after 30 minutes away. Please log in again.');
        }
      }, ADMIN_PASSWORD_IDLE_MS);
    }

    document.addEventListener('visibilitychange', () => {
      if (!adminPassword) return;
      if (document.hidden) {
        armAdminPasswordClearTimer();
      } else {
        clearTimeout(adminInactivityTimer);
      }
    });

    function disableAdminLoginForRetryAfter(seconds) {
      const delay = Math.max(1, Number(seconds || 900));
      const unlockAt = Date.now() + delay * 1000;
      adminUnlockBtn.disabled = true;
      const tick = () => {
        const remaining = Math.ceil((unlockAt - Date.now()) / 1000);
        if (remaining <= 0) {
          adminUnlockBtn.disabled = false;
          adminUnlockBtn.textContent = 'Login';
          return;
        }
        adminUnlockBtn.textContent = `Try again in ${Math.ceil(remaining / 60)}m`;
        setTimeout(tick, Math.min(remaining * 1000, 30000));
      };
      tick();
    }

    adminUnlockBtn.addEventListener('click', async () => {
      const key = adminKeyEl.value.trim();
      if (!key) return;

      const pre = getAdminLoginGuard();
      const now = Date.now();
      if (Number(pre.lockedUntil || 0) > now) {
        const minsLeft = Math.ceil((pre.lockedUntil - now) / 60000);
        openErrorModal(`Admin unlock failed: Too many wrong attempts. Account locked for ${minsLeft} more minute(s).`);
        return;
      }

      try {
        const res = await fetch(`${BOOKINGS_API_URL}?limit=1`, {
          headers: { 'X-Admin-Password': key }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 429) {
            const retryAfter = Number(res.headers.get('Retry-After') || 900);
            disableAdminLoginForRetryAfter(retryAfter);
            openErrorModal('Too many failed attempts. Please wait 15 minutes before trying again.');
            return;
          }
          if (res.status >= 500) {
            openErrorModal(data.error || 'Admin unlock failed because the backend is not configured correctly.');
            return;
          }
          const state = recordFailedAdminAttempt();
          const now2 = Date.now();
          if (Number(state.lockedUntil || 0) > now2) {
            openErrorModal('Admin unlock failed: Too many wrong attempts. Account locked for 60 minutes.');
            return;
          }
          const recentAttempts = state.attempts.filter((ts) => now2 - Number(ts || 0) <= ADMIN_TRY_WINDOW_MS).length;
          const triesLeft = Math.max(0, (ADMIN_MAX_TRIES + 1) - recentAttempts);
          openErrorModal(`Admin unlock failed: Wrong password entered, ${triesLeft} more tries available`);
          return;
        }
        clearAdminLoginGuard();
        adminPassword = key;
        adminKeyEl.value = '';
        setAdminAuthenticatedSession(true);
        injectAdminControls();
        setAdminUnlocked(true);
        const n = new Date();
        adminCalendarCursor = new Date(n.getFullYear(), n.getMonth(), 1);
        loadCategoryPrefs();
        initTaxUiDefaults();
        initAccountsUiDefaults();
        setAccountsTab('balances');
        disableLegacyCollapse();
        setAdminSectionTab('booking');
        loadBlurMoneyPref();
        markMoneyBlurTargets();
        await loadAdminData();
        await loadTaxTransactions();
        await loadAccountsData();
        await refreshInvoiceList();
      } catch (e) {
        openErrorModal(`Admin unlock failed: ${e.message || e}`);
      }
    });

    // Also allow Enter key on password input
    adminKeyEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        adminUnlockBtn.click();
      }
    });
    document.getElementById('admin-login-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      adminUnlockBtn.click();
    });

    let adminControlListenersBound = false;
    function bindAdminControlListeners() {
      if (adminControlListenersBound) return;
      adminControlListenersBound = true;
      adminSectionTabBtns.forEach((btn) => btn.addEventListener('click', () => setAdminSectionTab(btn.getAttribute('data-admin-tab'))));
      quoteModeAddBtn?.addEventListener('click', () => { resetQuoteForm(); openQuoteCreateModal(); });
      quoteModeViewBtn?.addEventListener('click', refreshQuoteList);
      quoteRefreshBtn?.addEventListener('click', refreshQuoteList);
      quoteFilterEl?.addEventListener('change', refreshQuoteList);
      quoteListEl?.addEventListener('click', handleQuoteActionClick);
          // ===== Booking Controls Event Listeners =====
          adminBlockBtn.addEventListener('click', () => setBlockedSlot(true));
          adminUnblockBtn.addEventListener('click', () => setBlockedSlot(false));
          adminBlockDayBtn.addEventListener('click', () => setBlockedDay(true));
          adminUnblockDayBtn.addEventListener('click', () => setBlockedDay(false));
          adminRefreshBtn.addEventListener('click', loadAdminData);
          adminCleanupPendingBtn?.addEventListener('click', cleanupOldPendingBookings);
          adminCalPrevBtn?.addEventListener('click', () => {
            const c = adminCalendarCursor || new Date();
            adminCalendarCursor = new Date(c.getFullYear(), c.getMonth() - 1, 1);
            loadAdminData();
          });
          adminCalNextBtn?.addEventListener('click', () => {
            const c = adminCalendarCursor || new Date();
            adminCalendarCursor = new Date(c.getFullYear(), c.getMonth() + 1, 1);
            loadAdminData();
          });

          // ===== Tax Ledger Event Listeners =====
          taxRefreshBtn?.addEventListener('click', loadTaxTransactions);
          taxYearEl.addEventListener('change', loadTaxTransactions);
          taxSummaryYearEl?.addEventListener('change', loadTaxTransactions);
          taxModeExpenseBtn?.addEventListener('click', () => setTaxEntryMode('expense'));
          taxModeOwnerTransferBtn?.addEventListener('click', openOwnerTransferModal);
          taxModeIncomeBtn?.addEventListener('click', () => setTaxEntryMode('income'));
          adminUserGuideBtn?.addEventListener('click', () => openUserGuideModal('expenses'));
          adminUserGuideTopBtn?.addEventListener('click', () => openUserGuideModal('expenses'));
          adminBlurAmountsBtn?.addEventListener('click', () => setBlurMoney(!blurMoneyEnabled));
          userGuideTabBtns.forEach((btn) => {
            btn.addEventListener('click', () => setUserGuideTab(btn.getAttribute('data-guide-tab')));
          });

          window.openTaxCategoryManager = () => {
            if (!taxCategoryModal) {
              openErrorModal('Category manager is unavailable on this page load. Please refresh and try again.');
              return;
            }
            taxCategoryModal.classList.add('active');
            taxCategoryModal.setAttribute('aria-hidden', 'false');
            try {
              renderCategoryManagerLists();
            } catch (e) {
              openErrorModal(`Could not load category manager: ${e.message || e}`);
            }
          };
          taxManageCategoriesBtn?.addEventListener('click', window.openTaxCategoryManager);

          const closeTaxCategoryModal = () => {
            taxCategoryModal.classList.remove('active');
            taxCategoryModal.setAttribute('aria-hidden', 'true');
          };
          taxCategoryCloseBtn?.addEventListener('click', closeTaxCategoryModal);
          taxCategoryXBtn?.addEventListener('click', closeTaxCategoryModal);
          taxCategoryModal?.addEventListener('click', (e) => {
            if (e.target === taxCategoryModal) {
              taxCategoryModal.classList.remove('active');
              taxCategoryModal.setAttribute('aria-hidden', 'true');
            }
          });

          addExpenseCategoryBtn?.addEventListener('click', () => {
            const name = (newExpenseCategoryEl.value || '').trim();
            if (!name) return;
            if (TAX_EXPENSE_CATEGORIES.some(c => c.toLowerCase() === name.toLowerCase())) {
              openErrorModal('Expense category already exists.');
              return;
            }
            TAX_EXPENSE_CATEGORIES.push(name);
            newExpenseCategoryEl.value = '';
            saveCategoryPrefs();
            renderCategoryOptions();
            renderCategoryManagerLists();
            openSuccessModal('Expense category added.', 'Category Added ✅');
          });

          addIncomeCategoryBtn?.addEventListener('click', () => {
            const name = (newIncomeCategoryEl.value || '').trim();
            if (!name) return;
            if (TAX_INCOME_CATEGORIES.some(c => c.toLowerCase() === name.toLowerCase())) {
              openErrorModal('Income category already exists.');
              return;
            }
            TAX_INCOME_CATEGORIES.push(name);
            newIncomeCategoryEl.value = '';
            saveCategoryPrefs();
            renderCategoryOptions();
            renderCategoryManagerLists();
            openSuccessModal('Income category added.', 'Category Added ✅');
          });

          taxMinimizeExpenseBtn?.addEventListener('click', () => {
            setTaxEntryMode('none');
          });

          taxMinimizeOwnerTransferBtn?.addEventListener('click', () => {
            const isHidden = taxOwnerTransferFields?.style.display === 'none';
            if (taxOwnerTransferFields) taxOwnerTransferFields.style.display = isHidden ? '' : 'none';
            taxMinimizeOwnerTransferBtn.textContent = isHidden ? 'Minimize' : 'Expand';
          });

          taxMinimizeIncomeBtn?.addEventListener('click', () => {
            setTaxEntryMode('none');
          });

          taxExpensePanel?.addEventListener('click', (e) => {
            if (e.target === taxExpensePanel) setTaxEntryMode('none');
          });
          taxIncomePanel?.addEventListener('click', (e) => {
            if (e.target === taxIncomePanel) setTaxEntryMode('none');
          });

          txFilterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
              activeTxFilter = btn.getAttribute('data-filter');
              txFilterBtns.forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              txCategoryFilterEl.style.display = activeTxFilter === 'expense' ? '' : 'none';
              if (activeTxFilter !== 'expense') txCategoryFilterEl.value = '';
              renderTxList();
            });
          });

          txCategoryFilterEl.addEventListener('change', renderTxList);
          taxAddExpenseBtn.addEventListener('click', addTaxExpense);
          taxUpdateExpenseBtn.addEventListener('click', addTaxExpense);
          taxCancelExpenseEditBtn.addEventListener('click', clearTaxExpenseForm);
          taxClearExpenseBtn.addEventListener('click', clearTaxExpenseForm);
          taxAddOwnerTransferBtn?.addEventListener('click', addTaxOwnerTransfer);
          taxClearOwnerTransferBtn?.addEventListener('click', clearTaxOwnerTransferForm);
          taxAddIncomeBtn.addEventListener('click', addTaxIncome);
          taxUpdateIncomeBtn.addEventListener('click', addTaxIncome);
          taxCancelIncomeEditBtn.addEventListener('click', clearTaxIncomeForm);
          taxClearIncomeBtn.addEventListener('click', clearTaxIncomeForm);

          document.getElementById('tax-expense-receipt').addEventListener('change', function() {
            document.getElementById('tax-expense-receipt-name').textContent = this.files[0] ? this.files[0].name : 'No file chosen';
          });
          document.getElementById('tax-income-receipt').addEventListener('change', function() {
            document.getElementById('tax-income-receipt-name').textContent = this.files[0] ? this.files[0].name : 'No file chosen';
          });

          taxExportBtn?.addEventListener('click', downloadTaxCsv);

          accountsRefreshBtn?.addEventListener('click', loadAccountsData);
          accountsRebuildAutoJournalBtn?.addEventListener('click', async () => {
            if (!adminPassword) {
              openErrorModal('Unlock admin first.');
              return;
            }
            const proceed = await openConfirmModal(
              'Rebuild all auto-generated journal entries from current Tax Income/Expense rows?',
              'Rebuild Auto Journal?',
              'Rebuild'
            );
            if (!proceed) return;

            const originalText = accountsRebuildAutoJournalBtn.textContent;
            const originalBg = accountsRebuildAutoJournalBtn.style.background;
            const originalBorder = accountsRebuildAutoJournalBtn.style.borderColor;
            const originalColor = accountsRebuildAutoJournalBtn.style.color;
            accountsRebuildAutoJournalBtn.disabled = true;
            accountsRebuildAutoJournalBtn.style.background = '#ff4fa3';
            accountsRebuildAutoJournalBtn.style.borderColor = '#ff4fa3';
            accountsRebuildAutoJournalBtn.style.color = '#fff';
            accountsRebuildAutoJournalBtn.textContent = 'Rebuilding…';
            let progressText = '';
            let animTick = 0;
            const anim = setInterval(() => {
              animTick = (animTick + 1) % 4;
              accountsRebuildAutoJournalBtn.textContent = `Rebuilding${'.'.repeat(animTick)}${' '.repeat(3 - animTick)}${progressText}`;
            }, 350);

            try {
              // Chunked rebuild: the worker processes a slice per call and returns
              // the next start index. Loop until done so we never exceed Cloudflare's
              // per-request DB-call limit on large ledgers.
              let start = 0;
              let total = 0;
              let processedTotal = 0;
              const allErrors = [];
              let guard = 0;
              while (true) {
                if (++guard > 1000) throw new Error('Rebuild did not finish (too many chunks)');
                const res = await fetch(ACCOUNTS_REBUILD_AUTO_JOURNAL_API_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
                  body: JSON.stringify({ start })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.ok) throw new Error(data.error || 'Rebuild failed');
                total = data.total || 0;
                processedTotal += (data.processed || 0);
                if (Array.isArray(data.errors) && data.errors.length) allErrors.push(...data.errors);
                progressText = total ? ` ${Math.min(processedTotal, total)}/${total}` : '';
                // Old (non-chunked) worker responses omit these fields — stop after one call.
                if (data.done || typeof data.nextStart !== 'number') break;
                start = data.nextStart;
              }
              await Promise.all([loadTaxTransactions(), loadAccountsData()]);
              const errNote = allErrors.length ? ` (${allErrors.length} rows skipped with errors)` : '';
              openSuccessModal(`Auto journal rebuilt successfully from current tax rows. ${processedTotal} of ${total} entries posted.${errNote}`, 'Rebuild Complete ✅');
            } catch (e) {
              openErrorModal(`Could not rebuild auto journal: ${e.message || e}`);
            } finally {
              clearInterval(anim);
              accountsRebuildAutoJournalBtn.disabled = false;
              accountsRebuildAutoJournalBtn.textContent = originalText;
              accountsRebuildAutoJournalBtn.style.background = originalBg;
              accountsRebuildAutoJournalBtn.style.borderColor = originalBorder;
              accountsRebuildAutoJournalBtn.style.color = originalColor;
            }
          });
          accountsYearCloseBtn?.addEventListener('click', openYearCloseWizard);
          auditPackageBtn?.addEventListener('click', openAuditPackageModal);
          reconRunBtn?.addEventListener('click', runReconciliation);
          invoiceModeViewBtn?.addEventListener('click', () => setInvoiceMode('view'));
          invoiceModeAddBtn?.addEventListener('click', () => setInvoiceMode('add'));
          invoiceFabBtn?.addEventListener('click', () => setInvoiceMode('add'));
          invoiceCreateBtn?.addEventListener('click', saveQuickInvoice);
          invoiceAddLineItemBtn?.addEventListener('click', () => {
            captureInvoiceDraftItems();
            invoiceDraftItems.push({ description: '', quantity: 1, unitAmount: '' });
            renderInvoiceLineItems();
          });
          invoiceLineItemsEl?.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('[data-remove-line-item]');
            if (!removeBtn) return;
            captureInvoiceDraftItems();
            const idx = Number(removeBtn.getAttribute('data-remove-line-item') || -1);
            if (idx < 0) return;
            invoiceDraftItems.splice(idx, 1);
            if (!invoiceDraftItems.length) invoiceDraftItems = [{ description: '', quantity: 1, unitAmount: '' }];
            renderInvoiceLineItems();
          });
          invoiceLineItemsEl?.addEventListener('input', updateInvoiceTotalDisplay);
          setInvoiceMode('view');
          renderInvoiceLineItems();
          orderAddManualBtn?.addEventListener('click', openManualOrderModal);
          manualOrderCancelBtn?.addEventListener('click', closeManualOrderModal);
          manualOrderSaveBtn?.addEventListener('click', async () => {
            const payload = {
              customerName: manualOrderCustomerNameEl?.value || '',
              customerEmail: manualOrderCustomerEmailEl?.value || '',
              customerPhone: manualOrderCustomerPhoneEl?.value || '',
              paymentMethod: manualOrderPaymentMethodEl?.value || '',
              paymentDate: manualOrderPaymentDateEl?.value || '',
              amount: manualOrderAmountEl?.value || '',
              orderSummary: manualOrderSummaryEl?.value || 'Survival Node',
              notes: manualOrderNotesEl?.value || ''
            };
            const email = String(payload.customerEmail || '').trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              openErrorModal('Enter a valid customer email address.');
              manualOrderCustomerEmailEl?.focus();
              return;
            }
            const prevTxt = manualOrderSaveBtn.textContent || 'Create Manual Order';
            manualOrderSaveBtn.disabled = true;
            manualOrderSaveBtn.textContent = 'Creating…';
            try {
              const res = await fetch(ORDER_MANUAL_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword }, body: JSON.stringify(payload) });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) { openErrorModal(data.error || 'Failed to create manual order'); return; }
              closeManualOrderModal();
              openSuccessModal('Manual Survival Node order created.', 'Manual Order Added ✅');
              if (manualOrderCustomerNameEl) manualOrderCustomerNameEl.value = '';
              if (manualOrderCustomerEmailEl) manualOrderCustomerEmailEl.value = '';
              if (manualOrderCustomerPhoneEl) manualOrderCustomerPhoneEl.value = '';
              if (manualOrderPaymentMethodEl) manualOrderPaymentMethodEl.value = '';
              if (manualOrderAmountEl) manualOrderAmountEl.value = '';
              if (manualOrderSummaryEl) manualOrderSummaryEl.value = 'Survival Node';
              if (manualOrderNotesEl) manualOrderNotesEl.value = '';
              await refreshOrderList();
            } finally {
              manualOrderSaveBtn.disabled = false;
              manualOrderSaveBtn.textContent = prevTxt;
            }
          });
          trackingCancelBtn?.addEventListener('click', closeTrackingModal);
          trackingSaveBtn?.addEventListener('click', async () => {
            if (!activeTrackingDraft) return;
            const payload = {
              bookingId: activeTrackingDraft.bookingId,
              orderKey: activeTrackingDraft.orderKey || '',
              trackingProvider: trackingProviderEl?.value || '',
              trackingNumber: trackingNumberEl?.value || ''
            };
            if (!(payload.trackingNumber || '').trim() && !confirm('Clear the saved tracking number for this order?')) return;
            const prevTxt = trackingSaveBtn.textContent || 'Save Tracking';
            const draft = { ...activeTrackingDraft };
            trackingSaveBtn.disabled = true;
            trackingSaveBtn.textContent = draft.forShippingEmail ? 'Continuing…' : 'Saving…';
            try {
              const res = await fetch(ORDER_TRACKING_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword }, body: JSON.stringify(payload) });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) { openErrorModal(data.error || 'Failed to save tracking'); return; }
              closeTrackingModal();
              await refreshOrderList();
              if (draft.forShippingEmail) {
                await openOrderEmailDraft(draft.bookingId, 'shipping', draft.orderKey || '', {
                  orderSummary: draft.orderSummary || '',
                  amountDisplay: draft.amountDisplay || '',
                  paymentDate: draft.paymentDate || ''
                });
              } else {
                openSuccessModal('Tracking saved for this order.', 'Tracking Updated ✅');
              }
            } finally {
              trackingSaveBtn.disabled = false;
              trackingSaveBtn.textContent = prevTxt;
            }
          });
          orderRefreshBtn?.addEventListener('click', refreshOrderList);
          orderFilterEl?.addEventListener('change', refreshOrderList);
          orderListEl?.addEventListener('click', handleOrderActionClick);
          orderEmailCancelBtn?.addEventListener('click', closeOrderEmailModal);
          orderEmailSubjectEl?.addEventListener('input', renderOrderEmailPreview);
          orderEmailBodyEl?.addEventListener('input', renderOrderEmailPreview);
          orderEmailTrackingNumberEl?.addEventListener('input', renderOrderEmailPreview);
          orderEmailSendBtn?.addEventListener('click', async () => {
            if (!activeOrderEmailDraft || orderEmailSendInFlight) return;
            const payload = {
              bookingId: activeOrderEmailDraft.bookingId,
              orderKey: activeOrderEmailDraft.orderKey || '',
              kind: activeOrderEmailDraft.kind,
              subject: orderEmailSubjectEl?.value || '',
              bodyText: orderEmailBodyEl?.value || '',
              trackingProvider: activeOrderEmailDraft.trackingProvider || '',
              trackingNumber: orderEmailTrackingNumberEl?.value || '',
              idempotencyKey: activeOrderEmailDraft.idempotencyKey || ''
            };
            const prevTxt = orderEmailSendBtn.textContent || 'Send Email';
            const draft = { ...activeOrderEmailDraft };
            orderEmailSendInFlight = true;
            orderEmailSendBtn.disabled = true;
            orderEmailSendBtn.textContent = 'Sending…';
            try {
              const res = await fetch(ORDER_SEND_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
                body: JSON.stringify(payload)
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) { openErrorModal(data.error || 'Failed to send order email'); return; }
              const successText = draft.kind === 'shipping'
                ? 'Shipping email sent and order marked shipped.'
                : draft.kind === 'delivered'
                  ? 'Delivered email sent and order marked delivered.'
                  : draft.kind === 'review'
                    ? 'Review request email sent to customer.'
                    : 'Acknowledgment email sent.';
              const successTitle = draft.kind === 'shipping'
                ? 'Shipment Email Sent ✅'
                : draft.kind === 'delivered'
                  ? 'Delivered Email Sent ✅'
                  : draft.kind === 'review'
                    ? 'Review Email Sent ✅'
                    : 'Acknowledgment Sent ✅';
              try { closeOrderEmailModal(); } catch {}
              try { openSuccessModal(successText, successTitle); } catch (err) { alert(successTitle + '\n\n' + successText); }
              try { await refreshOrderList(); } catch {}
            } catch (err) {
              openErrorModal(err?.message || 'Failed to send order email');
            } finally {
              orderEmailSendInFlight = false;
              orderEmailSendBtn.disabled = false;
              orderEmailSendBtn.textContent = prevTxt;
            }
          });
          invoiceRefreshBtn?.addEventListener('click', refreshInvoiceList);
          invoiceFilterEl?.addEventListener('change', refreshInvoiceList);
          invoiceSortEl?.addEventListener('change', refreshInvoiceList);
          invoiceListEl?.addEventListener('click', handleInvoiceActionClick);
          invoicePaymentCancelBtn?.addEventListener('click', closeInvoicePaymentModal);
          invoicePaymentSaveBtn?.addEventListener('click', submitInvoicePaymentModal);
          invoicePaymentModal?.addEventListener('click', (e) => { if (e.target === invoicePaymentModal) closeInvoicePaymentModal(); });
          accountsYearEl?.addEventListener('change', loadAccountsData);
          accountsFromEl?.addEventListener('change', loadAccountsData);
          accountsToEl?.addEventListener('change', loadAccountsData);
          accountsTabBalancesBtn?.addEventListener('click', () => setAccountsTab('balances'));
          accountsTabBalanceSheetBtn?.addEventListener('click', () => setAccountsTab('balance_sheet'));
          accountsTabPnlBtn?.addEventListener('click', () => setAccountsTab('pnl'));
          accountsTabCashflowBtn?.addEventListener('click', () => setAccountsTab('cashflow'));
          accountsTabJournalBtn?.addEventListener('click', () => setAccountsTab('journal'));

          const taxZipBtn = document.getElementById('tax-zip-btn');
          if (taxZipBtn) {
            taxZipBtn.addEventListener('click', async () => {
              if (typeof JSZip === 'undefined') { openErrorModal('JSZip not loaded — try refreshing the page.'); return; }
              const year = taxYearEl.value;
              taxZipBtn.textContent = 'Building…';
              taxZipBtn.disabled = true;
              try {
                const zip = new JSZip();
                const folder = zip.folder(`eastern-shore-ai-tax-${year}`);

                const csvRes = await fetch(`${TAX_EXPORT_API_URL}?year=${encodeURIComponent(year)}&type=all`, {
                  headers: { 'X-Admin-Password': adminPassword }
                });
                if (!csvRes.ok) throw new Error('CSV fetch failed');
                folder.file(`eastern-shore-ai-tax-${year}.csv`, await csvRes.blob());

                const txRes = await fetch(`${TAX_TX_API_URL}?year=${encodeURIComponent(year)}&type=all&limit=5000`, {
                  headers: { 'X-Admin-Password': adminPassword }
                });
                const txData = await txRes.json();
                const allRecords = [
                  ...(txData.expenses || []).map(r => ({ ...r, recType: 'expense' })),
                  ...(txData.income || []).map(r => ({ ...r, recType: 'income' }))
                ];

                const receiptsFolder = folder.folder('receipts');
                for (const r of allRecords) {
                  if (!r.receipt_key) continue;
                  const ext = r.receipt_key.split('.').pop();
                  const filename = `${r.recType}-${r.id}-${r.date || ''}.${ext}`;
                  const rRes = await fetch(`${TAX_RECEIPT_URL}?key=${encodeURIComponent(r.receipt_key)}`, { headers: { 'X-Admin-Password': adminPassword } });
                  if (rRes.ok) receiptsFolder.file(filename, await rRes.blob());
                }

                const blob = await zip.generateAsync({ type: 'blob' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `eastern-shore-ai-tax-${year}.zip`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
              } catch (e) {
                openErrorModal(`ZIP build failed: ${e.message || e}`);
              } finally {
                taxZipBtn.textContent = '⬇ Year Package (.zip)';
                taxZipBtn.disabled = false;
              }
            });
          }
    }
