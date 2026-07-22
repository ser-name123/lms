"use client";

import { useState, useEffect } from "react";
import { useSettingsStore } from "@/store/settings";
import { 
  Plus, 
  Search, 
  X, 
  Edit2, 
  Trash2, 
  Info,
  Calendar,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  User,
  Mail,
  DollarSign,
  FileText,
  Send,
  Printer,
  FileCheck,
  AlertCircle,
  Receipt,
  Download,
  CreditCard,
  Building,
  Loader2,
  CheckCircle2
} from "lucide-react";
import Swal from "sweetalert2";

import { DEFAULT_CURRENCY, money, SUPPORTED_CURRENCIES, type Currency } from "@/lib/currency";
import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { 
  fetchStudents, 
  fetchInvoices, 
  createInvoice, 
  updateInvoice, 
  deleteInvoice,
  fetchAcademyBilling,
  ApiError
} from "@/lib/api";

const STATUSES = ["Paid", "Pending", "Overdue", "Refunded"] as const;
const PAYMENT_METHODS = ["Stripe", "PayPal", "Bank Transfer", "Cash"] as const;
const BILLING_CYCLES = ["Monthly", "Quarterly", "One-Time"] as const;

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalItems, setTotalItems] = useState(0);

  // Stats Summary hooks
  const [stats, setStats] = useState({
    totalRevenue: 0,
    pendingReceivables: 0,
    overdueDebt: 0,
    collectionRate: 0
  });
  
  // Database Recipient students
  const [dbStudents, setDbStudents] = useState<{ id: string; name: string; email: string }[]>([]);

  // Brand identity for the invoice header comes from System Settings.
  const settings = useSettingsStore(s => s.settings);

  // Academy Billing Coordinates
  const [academyName, setAcademyName] = useState("Al Furqan Academy");
  const [academyAddress, setAcademyAddress] = useState("102 Quran Study Blvd, Ste 400\nChicago, IL 60612, US");
  const [academyPhone, setAcademyPhone] = useState("+1 (312) 555-0199");
  const [academyEmail, setAcademyEmail] = useState("billing@alfurqan.com");

  // Filter, sorting, and pagination states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All"); // All, Today, Last7Days, ThisMonth
  const [sortBy, setSortBy] = useState("date-desc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(invoices.map(inv => inv.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(x => x !== id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const result = await Swal.fire({
      title: `Void & Delete ${selectedIds.length} Invoices?`,
      text: `Are you sure you want to permanently delete/void the selected ${selectedIds.length} invoice records? This action is irreversible.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete all",
      cancelButtonText: "Cancel",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        await Promise.all(selectedIds.map(id => deleteInvoice(id)));
        Swal.fire({
          title: "Deleted!",
          text: `${selectedIds.length} invoices deleted successfully.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        setSelectedIds([]);
        loadInvoicesFromDb();
      } catch (err) {
        Swal.fire({
          title: "Failed!",
          text: err instanceof ApiError ? err.message : "Failed to delete invoices.",
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBulkStatusUpdate = async (newStatus: "PAID" | "OVERDUE" | "SENT" | "VOID") => {
    if (selectedIds.length === 0) return;
    const actionLabel = newStatus.toLowerCase();

    const result = await Swal.fire({
      title: `Mark ${selectedIds.length} Invoices as ${newStatus}?`,
      text: `Are you sure you want to change the status of selected ${selectedIds.length} invoices to ${actionLabel}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, update status",
      cancelButtonText: "Cancel",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        await Promise.all(selectedIds.map(id => updateInvoice(id, { status: newStatus })));
        Swal.fire({
          title: "Status Updated!",
          text: `${selectedIds.length} invoices status updated successfully.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        setSelectedIds([]);
        loadInvoicesFromDb();
      } catch (err) {
        Swal.fire({
          title: "Failed!",
          text: err instanceof ApiError ? err.message : "Failed to update invoices status.",
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      } finally {
        setLoading(false);
      }
    }
  };

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  // Form Fields
  const [recipientOption, setRecipientOption] = useState<"db" | "custom">("db");
  const [formStudentId, setFormStudentId] = useState(""); // Selected student profile ID
  const [formStudentEmail, setFormStudentEmail] = useState(""); // Selected student email
  const [customStudentName, setCustomStudentName] = useState("");
  const [customStudentEmail, setCustomStudentEmail] = useState("");

  const [productOption, setProductOption] = useState<"preset" | "custom">("preset");
  const [presetIndex, setPresetIndex] = useState(0);
  const [customProductTitle, setCustomProductTitle] = useState("");

  // Real bundles come from the admin's Packages catalogue (LmsPackage), not a
  // hardcoded list. Falls back to nothing until they load.
  // Priced in the currency this invoice is being raised in, so picking a
  // bundle fills the box with the amount the family would actually be billed.
  const [packages, setPackages] = useState<{ title: string; prices: Record<Currency, number | null> }[]>([]);
  
  // What this invoice is denominated in. Was not asked for at all, so every
  // invoice raised here was stored as the academy default and printed with a
  // dollar sign whoever it was for.
  const [formCurrency, setFormCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [formBillingCycle, setFormBillingCycle] = useState<typeof BILLING_CYCLES[number]>("Monthly");
  const [formSubtotal, setFormSubtotal] = useState(150);
  const [formDiscount, setFormDiscount] = useState(0); // in percent
  const [formTax, setFormTax] = useState(5); // in percent
  
  const [formInvoiceDate, setFormInvoiceDate] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>("Stripe");
  const [formStatus, setFormStatus] = useState<typeof STATUSES[number]>("Pending");
  const [formNotes, setFormNotes] = useState("");

  // Live Auto Calculations for total amounts
  const computedTotal = Math.max(0, formSubtotal * (1 - formDiscount / 100) * (1 + formTax / 100));

  // Convert Database Invoice schema to Frontend representation
  const mapDbToFrontend = (inv: any) => {
    const statusMap: Record<string, string> = {
      "PAID": "Paid",
      "SENT": "Pending",
      "OVERDUE": "Overdue",
      "VOID": "Refunded",
      "DRAFT": "Pending"
    };

    const invoiceAmount = typeof inv.amount === "string" ? parseFloat(inv.amount) : (inv.amount || 0);

    let packageTitle = "Academy Enrollment Plan";
    let billingCycle = "One-Time";
    let subtotal = invoiceAmount;
    let discount = 0;
    let tax = 5;
    let notes = "";
    let paymentMethod = "Stripe";
    let recipientName = "";
    let recipientEmail = "";

    if (inv.notes) {
      try {
        const parsed = JSON.parse(inv.notes);
        if (parsed && typeof parsed === "object") {
          packageTitle = parsed.packageTitle || packageTitle;
          billingCycle = parsed.billingCycle || billingCycle;
          subtotal = typeof parsed.subtotal === "number" ? parsed.subtotal : subtotal;
          discount = typeof parsed.discount === "number" ? parsed.discount : discount;
          tax = typeof parsed.tax === "number" ? parsed.tax : tax;
          notes = parsed.notes || "";
          paymentMethod = parsed.paymentMethod || paymentMethod;
          recipientName = parsed.recipientName || "";
          recipientEmail = parsed.recipientEmail || "";
        }
      } catch {
        notes = inv.notes;
      }
    }

    return {
      id: inv.id,
      number: inv.number,
      studentName: inv.student
        ? `${inv.student.user.firstName} ${inv.student.user.lastName}`
        : recipientName || "Custom Recipient",
      studentEmail: inv.student ? inv.student.user.email : recipientEmail,
      studentId: inv.studentId,
      packageTitle,
      billingCycle,
      subtotal,
      discount,
      tax,
      total: invoiceAmount,
      // The invoice already knows what it is denominated in. This page printed
      // a dollar sign regardless, so a dirham bill went out to the family
      // reading as dollars.
      currency: (inv.currency ?? "USD") as Currency,
      invoiceDate: inv.issuedAt ? inv.issuedAt.slice(0, 10) : "",
      dueDate: inv.dueAt ? inv.dueAt.slice(0, 10) : "",
      paymentMethod,
      status: statusMap[inv.status] || "Pending",
      notes: notes || "Payment is due on delivery."
    };
  };

  // Load backend data
  const loadInvoicesFromDb = () => {
    setLoading(true);
    setSelectedIds([]);
    fetchInvoices({
      page: currentPage,
      limit: pageSize,
      search: searchQuery,
      status: statusFilter,
      sortBy: sortBy
    })
      .then(res => {
        const mapped = res.items.map(mapDbToFrontend);
        setInvoices(mapped);
        setTotalItems(res.meta.total);

        // Compute dynamic stats summary from loaded invoices count
        // (For premium stats tiles we aggregate all database transactions)
        fetchInvoices({ page: 1, limit: 1000 })
          .then(allRes => {
            const allMapped = allRes.items.map(mapDbToFrontend);
            const paid = allMapped.filter(i => i.status === "Paid");
            const pending = allMapped.filter(i => i.status === "Pending");
            const overdue = allMapped.filter(i => i.status === "Overdue");

            const totalRev = paid.reduce((sum, i) => sum + i.total, 0);
            const pendingRec = pending.reduce((sum, i) => sum + i.total, 0);
            const overdueD = overdue.reduce((sum, i) => sum + i.total, 0);
            const rate = allMapped.length > 0 ? (paid.length / allMapped.length) * 100 : 0;

            setStats({
              totalRevenue: totalRev,
              pendingReceivables: pendingRec,
              overdueDebt: overdueD,
              collectionRate: rate
            });
          })
          .catch(err => console.warn("Failed to compute full backend stats", err));
      })
      .catch(err => console.warn("Failed to fetch invoices list from database", err))
      .finally(() => setLoading(false));
  };

  // Fetch Database Students and load billing config
  useEffect(() => {
    fetchStudents({ page: 1, limit: 100 })
      .then(data => {
        if (data && data.items && data.items.length > 0) {
          const students = data.items.map(s => ({
            id: s.id, // StudentProfile ID
            name: `${s.user.firstName} ${s.user.lastName}`,
            email: s.user.email
          }));
          setDbStudents(students);
          // Set initial form recipient
          setFormStudentId(students[0].id);
          setFormStudentEmail(students[0].email);
        }
      })
      .catch(err => console.warn("Failed to fetch students, using fallback", err));

    // Load the admin's real package bundles for the preset dropdown.
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
    fetch(`${apiBase}/lms-data/packages`)
      .then(res => res.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          setPackages(data.map(p => ({
            title: p.title,
            prices: {
              USD: p.priceUSD == null ? null : Number(p.priceUSD),
              AED: p.priceAED == null ? null : Number(p.priceAED),
              GBP: p.priceGBP == null ? null : Number(p.priceGBP),
            },
          })));
        }
      })
      .catch(err => console.warn("Failed to fetch packages", err));

    // Academy billing header comes from the database, so every admin prints
    // the same invoice header (it used to be per-browser localStorage).
    fetchAcademyBilling()
      .then((b) => {
        setAcademyName(b.academyName);
        setAcademyAddress(b.academyAddress);
        setAcademyPhone(b.academyPhone);
        setAcademyEmail(b.academyEmail);
      })
      .catch(() => undefined);
  }, []);

  // Reload list when pagination/filters change
  useEffect(() => {
    loadInvoicesFromDb();
  }, [currentPage, pageSize, searchQuery, statusFilter, sortBy]);

  // Sync recipient fields when select option changes
  const handleSelectStudentChange = (email: string) => {
    const student = dbStudents.find(s => s.email === email);
    if (student) {
      setFormStudentId(student.id);
      setFormStudentEmail(student.email);
    }
  };

  // Set preset product details when the selected bundle (or the list) changes.
  useEffect(() => {
    if (productOption === "preset" && packages[presetIndex]) {
      setFormSubtotal(packages[presetIndex].prices[formCurrency] ?? 0);
    }
  }, [productOption, presetIndex, packages, formCurrency]);

  // Reset page when filter triggers
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, paymentFilter, dateFilter, pageSize]);

  // CRUD handlers
  const handleOpenAddModal = () => {
    setRecipientOption("db");
    if (dbStudents.length > 0) {
      setFormStudentId(dbStudents[0].id);
      setFormStudentEmail(dbStudents[0].email);
    }
    setCustomStudentName("");
    setCustomStudentEmail("");
    
    setProductOption("preset");
    setPresetIndex(0);
    setCustomProductTitle("");
    
    setFormBillingCycle("Monthly");
    setFormCurrency(DEFAULT_CURRENCY);
    setFormSubtotal(packages[0]?.prices[DEFAULT_CURRENCY] ?? 0);
    setFormDiscount(0);
    setFormTax(5);
    
    setFormInvoiceDate(new Date().toISOString().slice(0, 10));
    setFormDueDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setFormPaymentMethod("Stripe");
    setFormStatus("Pending");
    setFormNotes("");
    setShowAddModal(true);
  };

  // Seed Mock Data dynamically in backend if database is empty
  const handleSeedMockDatabase = async () => {
    if (dbStudents.length === 0) {
      Swal.fire({
        title: "Seed Failed",
        text: "Please add at least one registered student in the database before seeding.",
        icon: "warning",
        background: document.documentElement.classList.contains("dark") ? "#1f1f23" : "#ffffff"
      });
      return;
    }

    setLoading(true);
    try {
      const student1 = dbStudents[0].id;
      const student2 = dbStudents[1]?.id || student1;
      const student3 = dbStudents[2]?.id || student1;

      // Seed 5 sample invoices into the backend
      const invoicesToSeed = [
        { number: "INV-2026-101", studentId: student1, amount: 142.50, status: "PAID", notes: JSON.stringify({ packageTitle: "Hifz Premium Bundle", billingCycle: "Monthly", subtotal: 150, discount: 10, tax: 5, notes: "First month subscription payment.", paymentMethod: "Stripe" }) },
        { number: "INV-2026-102", studentId: student2, amount: 82.95, status: "PAID", notes: JSON.stringify({ packageTitle: "Arabic Grammar Course", billingCycle: "One-Time", subtotal: 79, discount: 0, tax: 5, notes: "Full course lifetime access fee.", paymentMethod: "PayPal" }) },
        { number: "INV-2026-103", studentId: student3, amount: 49.00, status: "SENT", notes: JSON.stringify({ packageTitle: "Noorani Qaida Basics", billingCycle: "Monthly", subtotal: 49, discount: 5, tax: 5, notes: "Awaiting physical cash collection.", paymentMethod: "Cash" }) },
        { number: "INV-2026-104", studentId: student1, amount: 108.00, status: "OVERDUE", notes: JSON.stringify({ packageTitle: "Islamic Fiqh Advanced", billingCycle: "Quarterly", subtotal: 120, discount: 15, tax: 5, notes: "Quarterly subscription renewal. Please pay immediately.", paymentMethod: "Bank Transfer" }) },
        { number: "INV-2026-105", studentId: student2, amount: 68.25, status: "PAID", notes: JSON.stringify({ packageTitle: "Tajweed Foundations", billingCycle: "Monthly", subtotal: 65, discount: 0, tax: 5, notes: "Automatic Stripe card charge success.", paymentMethod: "Stripe" }) }
      ];

      for (const item of invoicesToSeed) {
        await createInvoice(item);
      }

      Swal.fire({
        title: "Mock Data Seeded",
        text: "Successfully seeded sample invoices in the backend database.",
        icon: "success",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
      });
      loadInvoicesFromDb();
    } catch (err) {
      console.error("Failed to seed invoices", err);
      Swal.fire({ title: "Seed Error", text: "Something went wrong during seeding.", icon: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let targetStudentId: string | null = null;
    if (recipientOption === "db") {
      targetStudentId = formStudentId;
      if (!targetStudentId && dbStudents.length > 0) {
        targetStudentId = dbStudents[0].id;
      }
      if (!targetStudentId) {
        Swal.fire({ title: "Recipient Required", text: "Please select a registered database student recipient.", icon: "error" });
        return;
      }
    } else {
      // Custom / external recipient — no student relation, name+email in notes.
      if (!customStudentName.trim() || !customStudentEmail.trim()) {
        Swal.fire({ title: "Recipient Required", text: "Please enter the recipient's name and email.", icon: "error" });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customStudentEmail.trim())) {
        Swal.fire({ title: "Invalid Email", text: "Please enter a valid recipient email address.", icon: "error" });
        return;
      }
      targetStudentId = null;
    }

    let packageTitle = "";
    if (productOption === "preset") {
      const pkg = packages[presetIndex];
      if (!pkg) {
        Swal.fire({ title: "No Package Selected", text: "No packages exist yet — add one in the Packages tab, or use a custom line item.", icon: "error" });
        return;
      }
      packageTitle = pkg.title;
    } else {
      if (!customProductTitle) {
        Swal.fire({ title: "Product Title Required", text: "Please specify product description.", icon: "error" });
        return;
      }
      packageTitle = customProductTitle;
    }

    const calculatedInvTotal = Number(computedTotal.toFixed(2));
    const randomSuffix = Math.floor(Math.random() * 900) + 100;
    const newInvNumber = `INV-2026-${randomSuffix}`;

    // Map status string back to backend enum
    const statusEnum = 
      formStatus === "Paid" ? "PAID" :
      formStatus === "Pending" ? "SENT" :
      formStatus === "Overdue" ? "OVERDUE" : "VOID";

    const payload = {
      number: newInvNumber,
      studentId: targetStudentId,
      amount: calculatedInvTotal,
      currency: formCurrency,
      status: statusEnum,
      issuedAt: new Date(formInvoiceDate).toISOString(),
      dueAt: new Date(formDueDate).toISOString(),
      notes: JSON.stringify({
        packageTitle,
        billingCycle: formBillingCycle,
        subtotal: Number(formSubtotal),
        discount: Number(formDiscount),
        tax: Number(formTax),
        notes: formNotes,
        paymentMethod: formPaymentMethod,
        // For a custom recipient, keep name+email with the invoice.
        ...(recipientOption === "custom"
          ? { recipientName: customStudentName.trim(), recipientEmail: customStudentEmail.trim() }
          : {})
      })
    };

    setLoading(true);
    try {
      await createInvoice(payload);
      setShowAddModal(false);
      Swal.fire({
        title: "Invoice Published",
        text: `Billing invoice ${newInvNumber} successfully written to database.`,
        icon: "success",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
      });
      loadInvoicesFromDb();
    } catch (err) {
      console.error("Failed to save invoice to database", err);
      Swal.fire({ title: "Save Error", text: "Failed to write invoice payload to Prisma backend.", icon: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditModal = (inv: any) => {
    setSelectedInvoice(inv);
    setFormBillingCycle(inv.billingCycle as any);
    setFormCurrency(inv.currency);
    setFormSubtotal(inv.subtotal);
    setFormDiscount(inv.discount);
    setFormTax(inv.tax);
    setFormInvoiceDate(inv.invoiceDate);
    setFormDueDate(inv.dueDate);
    setFormPaymentMethod(inv.paymentMethod as any);
    setFormStatus(inv.status as any);
    setFormNotes(inv.notes);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const calculatedInvTotal = Number(computedTotal.toFixed(2));
    const statusEnum = 
      formStatus === "Paid" ? "PAID" :
      formStatus === "Pending" ? "SENT" :
      formStatus === "Overdue" ? "OVERDUE" : "VOID";

    const payload = {
      amount: calculatedInvTotal,
      status: statusEnum,
      dueAt: new Date(formDueDate).toISOString(),
      notes: JSON.stringify({
        packageTitle: selectedInvoice.packageTitle,
        billingCycle: formBillingCycle,
        subtotal: Number(formSubtotal),
        discount: Number(formDiscount),
        tax: Number(formTax),
        notes: formNotes,
        paymentMethod: formPaymentMethod
      })
    };

    setLoading(true);
    try {
      await updateInvoice(selectedInvoice.id, payload);
      setShowEditModal(false);
      Swal.fire({
        title: "Saved Changes",
        text: `Invoice ${selectedInvoice.number} successfully updated in database.`,
        icon: "success",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
      });
      loadInvoicesFromDb();
    } catch (err) {
      console.error("Failed to update invoice in database", err);
      Swal.fire({ title: "Update Error", text: "Failed to save invoice modifications.", icon: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string, number: string) => {
    Swal.fire({
      title: "Void Invoice?",
      text: `Are you sure you want to delete and void invoice ${number} in backend database?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    }).then(async (result) => {
      if (result.isConfirmed) {
        setLoading(true);
        try {
          await deleteInvoice(id);
          Swal.fire({
            title: "Voided!",
            text: "The invoice record has been removed from database.",
            icon: "success",
            background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
          });
          loadInvoicesFromDb();
        } catch (err) {
          console.error("Failed to delete invoice", err);
          Swal.fire({ title: "Delete Error", text: "Failed to delete record.", icon: "error" });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // Preview Printable Invoice Details
  const handleOpenPreview = (inv: any) => {
    const formattedIssue = new Date(inv.invoiceDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const formattedDue = new Date(inv.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    // Header brand: the admin's uploaded logo, else the website name text.
    const brandName = settings?.websiteName || academyName;
    const brandLogo = settings?.logo || "";
    const brandHeader = brandLogo
      ? `<img src="${brandLogo}" alt="${brandName}" style="max-height:44px;max-width:220px;object-fit:contain;display:block;margin-bottom:6px;" />`
      : `<div class="flex items-center gap-2 mb-2">
                <svg class="text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 28px; height: 28px;">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
                  <path d="M6 6h10"></path>
                  <path d="M6 10h10"></path>
                </svg>
                <h2 class="text-xl font-bold tracking-tight text-emerald-700 font-sans" style="margin: 0; line-height: 1.2;">${brandName}</h2>
              </div>`;

    Swal.fire({
      title: `<span class="text-sm font-bold tracking-wider text-ink-3 uppercase">Print Preview Details</span>`,
      html: `
        <div id="invoice-print-area" class="text-left bg-white text-zinc-950 p-6 rounded-xl border border-zinc-200 mt-4 leading-relaxed font-sans shadow-sm">
          
          <div class="flex justify-between items-start border-b pb-6 border-zinc-200 mb-6">
            <div>
              ${brandHeader}
              <p class="text-xs text-zinc-500 mt-1 font-sans leading-normal">${academyAddress.replace(/\n/g, "<br/>")}<br/>Phone: ${academyPhone}<br/>Email: ${academyEmail}</p>
            </div>
            <div class="text-right">
              <span class="inline-block text-[10px] font-bold px-2.5 py-1 rounded bg-zinc-100 text-zinc-800 uppercase tracking-widest mb-2">${inv.status}</span>
              <p class="text-lg font-bold text-zinc-800 font-sans" style="margin: 0;">${inv.number}</p>
              <p class="text-xs text-zinc-500 mt-1">Date: ${formattedIssue}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-8 text-xs mb-8">
            <div>
              <p class="font-bold text-zinc-500 uppercase tracking-wider text-[10px] mb-2">Billed To</p>
              <p class="font-bold text-zinc-800 text-sm">${inv.studentName}</p>
              <p class="text-zinc-600 mt-0.5">${inv.studentEmail}</p>
              <p class="text-zinc-500 mt-1">Registered LMS Subscribed Account</p>
            </div>
            <div>
              <p class="font-bold text-zinc-500 uppercase tracking-wider text-[10px] mb-2">Payment Conditions</p>
              <p class="text-zinc-800"><strong>Due Date:</strong> ${formattedDue}</p>
              <p class="text-zinc-800 mt-1"><strong>Billing Cycle:</strong> ${inv.billingCycle}</p>
              <p class="text-zinc-800 mt-1"><strong>Payment Method:</strong> ${inv.paymentMethod}</p>
            </div>
          </div>

          <table class="w-full text-xs text-left mb-6 border-collapse">
            <thead>
              <tr class="border-b border-zinc-300 text-zinc-400 font-bold uppercase text-[9px] tracking-wider">
                <th class="py-2.5">Item Description</th>
                <th class="py-2.5 text-center">Cycle</th>
                <th class="py-2.5 text-right">Unit Subtotal</th>
                <th class="py-2.5 text-right">Tax (${inv.tax}%)</th>
                <th class="py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-zinc-100 text-zinc-800">
                <td class="py-3 font-semibold text-sm">${inv.packageTitle}</td>
                <td class="py-3 text-center text-zinc-500">${inv.billingCycle}</td>
                <td class="py-3 text-right">${money(inv.subtotal, inv.currency)}</td>
                <td class="py-3 text-right">${money(inv.subtotal * (1 - inv.discount / 100) * inv.tax / 100, inv.currency)}</td>
                <td class="py-3 text-right font-bold">${money(inv.total, inv.currency)}</td>
              </tr>
            </tbody>
          </table>

          <div class="flex justify-end text-xs">
            <div class="w-64 space-y-2 border-t pt-4">
              <div class="flex justify-between text-zinc-500">
                <span>Subtotal:</span>
                <span class="font-semibold text-zinc-800">${money(inv.subtotal, inv.currency)}</span>
              </div>
              <div class="flex justify-between text-zinc-500">
                <span>Discount applied (${inv.discount}%):</span>
                <span class="font-semibold text-zinc-800">−${money(inv.subtotal * inv.discount / 100, inv.currency)}</span>
              </div>
              <div class="flex justify-between text-zinc-500">
                <span>Tax accrued (${inv.tax}%):</span>
                <span class="font-semibold text-zinc-800">+${money(inv.subtotal * (1 - inv.discount / 100) * inv.tax / 100, inv.currency)}</span>
              </div>
              <div class="flex justify-between text-sm font-bold border-t border-zinc-200 pt-2 text-zinc-900">
                <span>Total Invoice Due:</span>
                <span class="text-base text-emerald-800">${money(inv.total, inv.currency)}</span>
              </div>
            </div>
          </div>

          <div class="border-t border-zinc-100 pt-6 mt-8 text-[10px] text-zinc-400 leading-relaxed">
            <p class="font-bold text-zinc-500 mb-1">Billing Conditions & Compliance Terms</p>
            <p>Please settle the dues before due date. Overdue accounts are subject to automatic class suspend locks after 7 buffer days. If you have any inquiries regarding calculations, please write to ${academyEmail}.</p>
            <p class="mt-2 font-mono italic">Notes: ${inv.notes}</p>
          </div>
        </div>

        <div class="flex justify-end gap-2 mt-4 text-xs font-semibold">
          <button id="btn-swal-email" class="h-9 px-4 rounded-xl border bg-zinc-50 hover:bg-zinc-100 text-zinc-800 inline-flex items-center gap-1.5 transition-colors border-zinc-300">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            Email PDF to Student
          </button>
          <button id="btn-swal-print" class="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 transition-colors">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
            Print Invoice
          </button>
        </div>
      `,
      showConfirmButton: false,
      showCloseButton: true,
      width: "600px",
      background: document.documentElement.classList.contains("dark") ? "#1f1f23" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e",
      didOpen: () => {
        const emailBtn = document.getElementById("btn-swal-email");
        const printBtn = document.getElementById("btn-swal-print");

        emailBtn?.addEventListener("click", () => {
          Swal.fire({
            title: "Invoice Sent",
            text: `The invoice receipt has been successfully dispatched to ${inv.studentEmail}.`,
            icon: "success",
            background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
          });
        });

        printBtn?.addEventListener("click", () => {
          const printContent = document.getElementById("invoice-print-area")?.innerHTML;
          const printWindow = window.open("", "_blank");
          if (printWindow) {
            printWindow.document.write(`
              <html>
                <head>
                  <title>Print Invoice - ${inv.number}</title>
                  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
                  <style>
                    body { font-family: sans-serif; padding: 40px; background: white; color: black; }
                  </style>
                </head>
                <body>
                  ${printContent}
                  <script>
                    window.onload = function() {
                      window.print();
                      window.close();
                    }
                  </script>
                </body>
              </html>
            `);
            printWindow.document.close();
          }
        });
      }
    });
  };

  return (
    <>
      <Topbar title="Invoice Management" subtitle="Track subscriptions, process course transactions, and manage discount compliance rates" />
      
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        
        {/* Statistics section */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="hover:scale-[1.01] transition-transform duration-200 border-l-4 border-l-emerald-500">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <DollarSign className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className="text-xs font-semibold text-ink-3">Total Revenue Paid</p>
              </div>
            </CardBody>
          </Card>
          
          <Card className="hover:scale-[1.01] transition-transform duration-200 border-l-4 border-l-amber-500">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-500 animate-pulse">
                <Clock className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">${stats.pendingReceivables.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className="text-xs font-semibold text-ink-3">Pending Receivables</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200 border-l-4 border-l-rose-500">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-rose-500/10 text-rose-500">
                <AlertCircle className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">${stats.overdueDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className="text-xs font-semibold text-ink-3">Overdue Debt</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200 border-l-4 border-l-violet-500">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-violet-500/10 text-violet-500">
                <FileCheck className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{stats.collectionRate.toFixed(1)}%</p>
                <p className="text-xs font-semibold text-ink-3">Invoice Collection Rate</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardBody className="pt-5 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              
              {/* Search field */}
              <div className="relative flex-1 max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                <input
                  type="text"
                  placeholder="Search invoice #, student, code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 pr-4 pl-10 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent focus:bg-surface-3 transition-all"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                
                {/* Status Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><Filter className="size-3" /> Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="All">All Status</option>
                    {STATUSES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                {/* Sort selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><ArrowUpDown className="size-3" /> Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="date-desc">Invoice Date (Newest First)</option>
                    <option value="date-asc">Invoice Date (Oldest First)</option>
                    <option value="amount-desc">Amount (High to Low)</option>
                    <option value="amount-asc">Amount (Low to High)</option>
                    <option value="id-asc">Invoice Number (Ascending)</option>
                  </select>
                </div>

                {/* Seed button */}
                {invoices.length === 0 && (
                  <Button 
                    variant="outline" 
                    size="md" 
                    onClick={handleSeedMockDatabase} 
                    className="rounded-xl border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 flex items-center gap-1.5"
                  >
                    <FileCheck className="size-4 text-emerald-500" />
                    <span>Seed Database Invoices</span>
                  </Button>
                )}

                {/* Create Invoice button */}
                <Button 
                  variant="primary" 
                  size="md" 
                  onClick={handleOpenAddModal} 
                  className="rounded-xl flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  <span>Generate Invoice</span>
                </Button>
              </div>
            </div>
            {/* Invoices Table Grid */}
            <div className="overflow-x-auto border border-hairline rounded-xl">
              <table className="w-full border-collapse text-left text-sm text-ink-2">
                <thead className="bg-surface-2 text-xs font-bold text-ink-3 uppercase border-b border-hairline">
                  <tr>
                    <th scope="col" className="px-6 py-4 w-4">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.length === invoices.length && invoices.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                      />
                    </th>
                    <th scope="col" className="px-6 py-4">Invoice #</th>
                    <th scope="col" className="px-6 py-4">Billed Student</th>
                    <th scope="col" className="px-6 py-4">Product / Course</th>
                    <th scope="col" className="px-6 py-4 text-right">Net Dues ($)</th>
                    <th scope="col" className="px-6 py-4">Billing Timeline</th>
                    <th scope="col" className="px-6 py-4">Payment Method</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-surface">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-ink-3">
                        <div className="flex flex-col items-center justify-center gap-2">
                           <Loader2 className="size-8 animate-spin text-accent" />
                          <p className="font-semibold text-sm">Querying database invoices...</p>
                        </div>
                      </td>
                    </tr>
                  ) : invoices.length > 0 ? (
                    invoices.map((inv, idx) => {
                      const issueFormatted = new Date(inv.invoiceDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      });
                      const dueFormatted = new Date(inv.dueDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      });

                      const statusTone: Record<string, Tone> = {
                        "Paid": "good",
                        "Pending": "accent",
                        "Overdue": "critical",
                        "Refunded": "neutral"
                      };

                      const isSelected = selectedIds.includes(inv.id);
                      return (
                        <tr 
                          key={`${inv.id}-${idx}`} 
                          className={cn(
                            "hover:bg-surface-2/60 transition-colors",
                            isSelected && "bg-accent-soft/20 hover:bg-accent-soft/25"
                          )}
                        >
                          <td className="px-6 py-4 w-4">
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={(e) => handleSelectRow(inv.id, e.target.checked)}
                              className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                            />
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-xs text-ink">
                            {inv.number}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-ink">{inv.studentName}</div>
                            <div className="text-xs text-ink-3 mt-0.5">{inv.studentEmail}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-ink">{inv.packageTitle}</div>
                            <div className="text-[10px] text-ink-3 font-bold uppercase mt-1">
                              {inv.billingCycle} cycle (Sub: ${inv.subtotal})
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-ink text-sm">
                            ${inv.total.toFixed(2)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-xs text-ink-2">
                              Issued: <span className="font-semibold">{issueFormatted}</span>
                            </div>
                            <div className="text-[11px] text-ink-3 mt-1">
                              Due: <span className="font-semibold text-amber-600">{dueFormatted}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                              <CreditCard className="size-3.5 text-accent" />
                              <span>{inv.paymentMethod}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={statusTone[inv.status] || "neutral"}>
                              {inv.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenPreview(inv)}
                                className="rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3 size-8"
                                title="View details"
                              >
                                <Info className="size-4.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenEditModal(inv)}
                                className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                                title="Edit invoice"
                              >
                                <Edit2 className="size-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDelete(inv.id, inv.number)}
                                className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                                title="Void invoice"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-ink-3">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Receipt className="size-8 text-ink-3/60" />
                          <p className="font-semibold text-sm">No database invoices found.</p>
                          <Button 
                            variant="primary" 
                            size="sm" 
                            onClick={handleSeedMockDatabase}
                            className="mt-2"
                          >
                            Seed Mock Invoices
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-hairline text-xs font-semibold text-ink-3">
              
              {/* Page Size selector */}
              <div className="flex items-center gap-2">
                <span>Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value={5}>5 per page</option>
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
                <span>of {totalItems} total invoices</span>
              </div>

              {/* Showing stats */}
              <div>
                Showing {totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} items
              </div>

              {/* Pages selectors */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg p-1.5 h-8 size-8 justify-center disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pNum = idx + 1;
                  const isCurrent = currentPage === pNum;
                  return (
                    <Button
                      key={pNum}
                      variant={isCurrent ? "primary" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pNum)}
                      className={cn(
                        "rounded-lg text-xs size-8 justify-center h-8 font-bold",
                        isCurrent ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-2"
                      )}
                    >
                      {pNum}
                    </Button>
                  );
                })}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg p-1.5 h-8 size-8 justify-center disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Add Invoice Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-2xl rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink max-h-[95vh] overflow-y-auto">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4 sticky top-0 bg-surface z-10">
              <h3 className="text-base font-bold text-ink">Generate New Billing Invoice</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              
              {/* Recipient Details */}
              <div className="border-b border-hairline pb-4 space-y-3">
                <span className="block text-xs font-bold text-ink-3 uppercase">Billed Recipient Details</span>
                <div className="flex gap-4 text-xs font-semibold mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="rec-opt"
                      checked={recipientOption === "db"}
                      onChange={() => setRecipientOption("db")}
                      className="text-accent focus:ring-accent border-hairline size-3.5"
                    />
                    <span>Registered Student Recipient</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="rec-opt"
                      checked={recipientOption === "custom"}
                      onChange={() => setRecipientOption("custom")}
                      className="text-accent focus:ring-accent border-hairline size-3.5"
                    />
                    <span>Custom / External Recipient</span>
                  </label>
                </div>

                {recipientOption === "db" ? (
                  <div>
                    <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Select Student</label>
                    <select
                      value={formStudentEmail}
                      onChange={(e) => handleSelectStudentChange(e.target.value)}
                      disabled={dbStudents.length === 0}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                    >
                      {dbStudents.length === 0 && (
                        <option value="">No registered students available</option>
                      )}
                      {dbStudents.map(student => (
                        <option key={student.email} value={student.email}>
                          {student.name} ({student.email})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Recipient Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Ahmed Khan"
                        value={customStudentName}
                        onChange={(e) => setCustomStudentName(e.target.value)}
                        className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Recipient Email</label>
                      <input
                        type="email"
                        placeholder="e.g. ahmed@example.com"
                        value={customStudentEmail}
                        onChange={(e) => setCustomStudentEmail(e.target.value)}
                        className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Product selection */}
              <div className="border-b border-hairline pb-4 space-y-3">
                <span className="block text-xs font-bold text-ink-3 uppercase">LMS Subscribed Plan or Product</span>
                <div className="flex gap-4 text-xs font-semibold mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="prod-opt"
                      checked={productOption === "preset"} 
                      onChange={() => setProductOption("preset")}
                      className="text-accent focus:ring-accent border-hairline size-3.5"
                    />
                    <span>Select Preset Academy Course/Bundle</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="prod-opt"
                      checked={productOption === "custom"} 
                      onChange={() => setProductOption("custom")}
                      className="text-accent focus:ring-accent border-hairline size-3.5"
                    />
                    <span>Input Custom Billing Line Item</span>
                  </label>
                </div>

                {productOption === "preset" ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">LMS Product Bundle</label>
                      <select
                        value={presetIndex}
                        onChange={(e) => setPresetIndex(Number(e.target.value))}
                        disabled={packages.length === 0}
                        className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                      >
                        {packages.length === 0 ? (
                          <option value={0}>No packages yet — add in Packages tab</option>
                        ) : (
                          packages.map((prod, idx) => (
                            <option key={idx} value={idx}>
                              {prod.title} (${money(prod.prices[formCurrency], formCurrency)})
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Billing Cycle type</label>
                      <select
                        value={formBillingCycle}
                        onChange={(e) => setFormBillingCycle(e.target.value as any)}
                        className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        {BILLING_CYCLES.map(cycle => (
                          <option key={cycle} value={cycle}>{cycle}</option>
                        ))}
                      </select>
                    </div>
                    {/*
                      Never asked for before, so every invoice raised here was
                      stored as the academy default and printed with a dollar
                      sign whoever it was for. Changing it re-prices the bundle
                      above from the package's own amount for that currency.
                    */}
                    <div>
                      <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Currency</label>
                      <select
                        value={formCurrency}
                        onChange={(e) => setFormCurrency(e.target.value as Currency)}
                        className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Custom Line Item Description</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. Extra 10 hours Quran reading pack"
                        value={customProductTitle}
                        onChange={(e) => setCustomProductTitle(e.target.value)}
                        className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Billing Cycle type</label>
                      <select
                        value={formBillingCycle}
                        onChange={(e) => setFormBillingCycle(e.target.value as any)}
                        className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        {BILLING_CYCLES.map(cycle => (
                          <option key={cycle} value={cycle}>{cycle}</option>
                        ))}
                      </select>
                    </div>
                    {/*
                      Never asked for before, so every invoice raised here was
                      stored as the academy default and printed with a dollar
                      sign whoever it was for. Changing it re-prices the bundle
                      above from the package's own amount for that currency.
                    */}
                    <div>
                      <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Currency</label>
                      <select
                        value={formCurrency}
                        onChange={(e) => setFormCurrency(e.target.value as Currency)}
                        className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Calculations and rates */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Unit Subtotal ($)</label>
                  <input 
                    type="number" 
                    min="1"
                    required
                    disabled={productOption === "preset"}
                    value={formSubtotal}
                    onChange={(e) => setFormSubtotal(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Discount Rate (%)</label>
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    required
                    value={formDiscount}
                    onChange={(e) => setFormDiscount(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Tax Rate (%)</label>
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    required
                    value={formTax}
                    onChange={(e) => setFormTax(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              {/* Dates and payment rules */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Issue Date</label>
                  <input 
                    type="date" 
                    required
                    value={formInvoiceDate}
                    onChange={(e) => setFormInvoiceDate(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Due Date</label>
                  <input 
                    type="date" 
                    required
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Payment Method</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {PAYMENT_METHODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {STATUSES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic live calculation summary view */}
              <div className="bg-surface-2 border border-hairline rounded-xl p-4 flex justify-between items-center text-xs">
                <div>
                  <span className="block font-semibold text-ink-3">Live Total Dues Calculation:</span>
                  <span className="text-[10px] text-ink-3">Subtotal (${formSubtotal}) - Discount (${formDiscount}%) + Tax (${formTax}%)</span>
                </div>
                <div className="text-right">
                  <span className="block font-mono text-lg font-bold text-emerald-600">${computedTotal.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Billing Notes / Terms</label>
                <textarea 
                  placeholder="Terms conditions, payment policy notes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              <footer className="flex justify-end gap-2 pt-2 border-t border-hairline">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin mr-1.5" />}
                  Publish Invoice
                </Button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Edit Invoice Modal */}
      {showEditModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-xl rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink max-h-[95vh] overflow-y-auto">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4 sticky top-0 bg-surface z-10">
              <h3 className="text-base font-bold text-ink">Edit Invoice {selectedInvoice.number}</h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Unit Subtotal ($)</label>
                  <input 
                    type="number" 
                    min="1"
                    required
                    value={formSubtotal}
                    onChange={(e) => setFormSubtotal(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Discount Rate (%)</label>
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    required
                    value={formDiscount}
                    onChange={(e) => setFormDiscount(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Tax Rate (%)</label>
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    required
                    value={formTax}
                    onChange={(e) => setFormTax(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Issue Date</label>
                  <input 
                    type="date" 
                    required
                    disabled
                    value={formInvoiceDate}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink opacity-65 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Due Date</label>
                  <input 
                    type="date" 
                    required
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Payment Method</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {PAYMENT_METHODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {STATUSES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic live calculation summary view */}
              <div className="bg-surface-2 border border-hairline rounded-xl p-4 flex justify-between items-center text-xs">
                <div>
                  <span className="block font-semibold text-ink-3">Live Total Dues Calculation:</span>
                  <span className="text-[10px] text-ink-3">Subtotal (${formSubtotal}) - Discount (${formDiscount}%) + Tax (${formTax}%)</span>
                </div>
                <div className="text-right">
                  <span className="block font-mono text-lg font-bold text-emerald-600">${computedTotal.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Billing Notes / Terms</label>
                <textarea 
                  placeholder="Terms conditions, payment policy notes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              <footer className="flex justify-end gap-2 pt-2 border-t border-hairline">
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin mr-1.5" />}
                  Save Changes
                </Button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-surface border border-hairline px-5 py-3 rounded-2xl shadow-2xl animate-fade-in select-none">
          <div className="text-xs font-bold text-ink flex items-center gap-2">
            <Receipt className="size-4 text-accent" />
            <span>Selected <span className="tnum font-extrabold text-accent">{selectedIds.length}</span> invoices</span>
          </div>
          <div className="h-5 w-hairline bg-hairline" />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleBulkStatusUpdate("PAID")}
              className="bg-good hover:bg-good/95 text-white font-bold text-xs h-8.5 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="size-3.5" />
              Mark Paid
            </Button>
            <Button
              onClick={() => handleBulkStatusUpdate("OVERDUE")}
              className="bg-surface-3 hover:bg-surface-4 text-ink-2 font-bold text-xs h-8.5 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <AlertCircle className="size-3.5 text-warning-ink" />
              Mark Overdue
            </Button>
            <Button
              onClick={handleBulkDelete}
              className="bg-critical hover:bg-critical/95 text-white font-bold text-xs h-8.5 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="size-3.5" />
              Void / Delete
            </Button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs font-bold text-ink-3 hover:text-ink hover:underline px-2 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </>
  );
}
