import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getEmployees from '@salesforce/apex/EmployeeController.getEmployees';
import saveEmployee from '@salesforce/apex/EmployeeController.saveEmployee';
import deleteEmployee from '@salesforce/apex/EmployeeController.deleteEmployee';

const PAGE_SIZE = 8;

const DEPT_CLASS_MAP = {
    'Engineering':  'dept-badge dept-engineering',
    'HR':           'dept-badge dept-hr',
    'Finance':      'dept-badge dept-finance',
    'Marketing':    'dept-badge dept-marketing',
    'Sales':        'dept-badge dept-sales',
    'Operations':   'dept-badge dept-operations',
};

export default class EmployeeCard extends LightningElement {

    // ── Wire ──────────────────────────────────────────────────────────────
    @wire(getEmployees)
    wiredResult;

    // ── State ─────────────────────────────────────────────────────────────
    @track searchTerm      = '';
    @track currentPage     = 1;
    @track sortField       = 'Employee_ID__c';
    @track sortDirection   = 'asc';

    @track showModal         = false;
    @track showDeleteConfirm = false;
    @track isEditMode        = false;
    @track isSaving          = false;
    @track deleteTargetId    = null;

    @track currentRecord = this._emptyRecord();

    // ── Department Picklist ───────────────────────────────────────────────
    departmentOptions = [
        { label: '-- None --',   value: '' },
        { label: 'CE',  value: 'CE' },
        { label: 'IT',           value: 'IT' },
        { label: 'ENTC',      value: 'ENTC' },
        { label: 'ECE',    value: 'ECE' }
    ];

    // ── Computed: raw list ────────────────────────────────────────────────
    get allEmployees() {
        if (!this.wiredResult?.data) return [];
        return this.wiredResult.data.map(emp => ({
            ...emp,
            initials:       this._initials(emp.Name),
            deptClass:      DEPT_CLASS_MAP[emp.Department__c] || 'dept-badge dept-default',
            mailtoLink:     `mailto:${emp.Email__c}`,
            formattedDate:  this._formatDate(emp.Joining_Date__c),
            formattedSalary: this._formatCurrency(emp.Salary__c),
        }));
    }

    get isLoading()  { return !this.wiredResult?.data && !this.wiredResult?.error; }
    get hasError()   { return !!this.wiredResult?.error; }
    get errorMessage() {
        return this.wiredResult?.error?.body?.message || 'An unexpected error occurred.';
    }

    // ── Computed: search + sort + paginate ────────────────────────────────
    get sortedFiltered() {
        const q = this.searchTerm.toLowerCase().trim();
        let list = q
            ? this.allEmployees.filter(e =>
                (e.Name || '').toLowerCase().includes(q) ||
                (e.Email__c || '').toLowerCase().includes(q) ||
                (e.Department__c || '').toLowerCase().includes(q) ||
                String(e.Employee_ID__c || '').includes(q)
              )
            : [...this.allEmployees];

        const field = this.sortField;
        const dir   = this.sortDirection === 'asc' ? 1 : -1;
        list.sort((a, b) => {
            const av = a[field] ?? '';
            const bv = b[field] ?? '';
            return av < bv ? -dir : av > bv ? dir : 0;
        });

        return list;
    }

    get totalPages()       { return Math.max(1, Math.ceil(this.sortedFiltered.length / PAGE_SIZE)); }
    get isFirstPage()      { return this.currentPage <= 1; }
    get isLastPage()       { return this.currentPage >= this.totalPages; }
    get isEmpty()          { return !this.isLoading && !this.hasError && this.sortedFiltered.length === 0; }
    get hasData()          { return !this.isLoading && !this.hasError && this.sortedFiltered.length > 0; }
    get paginationLabel()  {
        const total = this.sortedFiltered.length;
        const start = (this.currentPage - 1) * PAGE_SIZE + 1;
        const end   = Math.min(this.currentPage * PAGE_SIZE, total);
        return `${start}–${end} of ${total}`;
    }

    get filteredEmployees() {
        const start = (this.currentPage - 1) * PAGE_SIZE;
        return this.sortedFiltered.slice(start, start + PAGE_SIZE);
    }

    get sortIcon()         { return this.sortDirection === 'asc' ? 'utility:arrowup' : 'utility:arrowdown'; }
    get isSortedByEmpId()  { return this.sortField === 'Employee_ID__c'; }
    get isSortedByName()   { return this.sortField === 'Name'; }
    get isSortedByDate()   { return this.sortField === 'Joining_Date__c'; }

    get modalTitle()       { return this.isEditMode ? 'Edit Employee' : 'New Employee'; }
    get saveLabel()        { return this.isSaving ? 'Saving...' : (this.isEditMode ? 'Update' : 'Save'); }

    // ── Handlers: search & pagination ────────────────────────────────────
    handleSearch(event) {
        this.searchTerm  = event.target.value;
        this.currentPage = 1;
    }

    handlePrevPage() { if (!this.isFirstPage) this.currentPage--; }
    handleNextPage() { if (!this.isLastPage)  this.currentPage++; }

    // ── Handlers: sort ────────────────────────────────────────────────────
    handleSort(event) {
        const field = event.currentTarget.dataset.field;
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField     = field;
            this.sortDirection = 'asc';
        }
        this.currentPage = 1;
    }

    // ── Handlers: CRUD ────────────────────────────────────────────────────
    handleNewEmployee() {
        this.currentRecord = this._emptyRecord();
        this.isEditMode    = false;
        this.showModal     = true;
    }

    handleEdit(event) {
        const id  = event.currentTarget.dataset.id;
        const rec = this.allEmployees.find(e => e.Id === id);
        if (rec) {
            this.currentRecord = { ...rec };
            this.isEditMode    = true;
            this.showModal     = true;
        }
    }

    handleDelete(event) {
        this.deleteTargetId    = event.currentTarget.dataset.id;
        this.showDeleteConfirm = true;
    }

    handleCancelDelete() {
        this.showDeleteConfirm = false;
        this.deleteTargetId    = null;
    }

    async handleConfirmDelete() {
        try {
            await deleteEmployee({ recordId: this.deleteTargetId });
            this._toast('Success', 'Employee deleted.', 'success');
            this.showDeleteConfirm = false;
            this.deleteTargetId    = null;
            await refreshApex(this.wiredResult);
        } catch (err) {
            this._toast('Error', err?.body?.message || 'Delete failed.', 'error');
        }
    }

    handleFieldChange(event) {
        const field = event.target.dataset.field;
        this.currentRecord = { ...this.currentRecord, [field]: event.target.value };
    }

    async handleSave() {
        if (!this._validate()) return;
        this.isSaving = true;
        try {
            await saveEmployee({ employee: this.currentRecord });
            this._toast('Success', `Employee ${this.isEditMode ? 'updated' : 'created'} successfully.`, 'success');
            this.showModal = false;
            await refreshApex(this.wiredResult);
        } catch (err) {
            this._toast('Error', err?.body?.message || 'Save failed.', 'error');
        } finally {
            this.isSaving = false;
        }
    }

    handleModalClose() {
        this.showModal = false;
    }

    // ── Retry (wired error) ───────────────────────────────────────────────
    loadEmployees() {
        refreshApex(this.wiredResult);
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    _emptyRecord() {
        return {
            Id:              null,
            Name:            '',
            Employee_ID__c:  null,
            Department__c:   '',
            Email__c:        '',
            Joining_Date__c: '',
            Salary__c:       null,
        };
    }

    _initials(name = '') {
        return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    }

    _formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    _formatCurrency(val) {
        if (val == null) return '—';
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
    }

    _validate() {
        const inputs = [...this.template.querySelectorAll('lightning-input[required], lightning-combobox[required]')];
        const allValid = inputs.reduce((valid, inp) => inp.reportValidity() && valid, true);
        if (!allValid) this._toast('Validation', 'Please fill in all required fields.', 'warning');
        return allValid;
    }

    _toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}