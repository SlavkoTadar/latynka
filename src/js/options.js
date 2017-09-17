'use strict'

const Settings = require('./settings').Settings
    , html_i18n = require('./html_i18n')
    , Dom = require('./dom_builder').DomBuilder
    , browserapi = require('./browserapi')
    , markdown = require('./markdown')
    , random = require('./random')
    , jaaml = require('./jaaml')
    , validator = require('./rule_validator')
    , sharer = require('./sharer')
    , translit = require('./translit')
    , urlshortener = require('./urlshortener')


function _safe_element_id(value) {
    return (value || '').replace(/[^\w\-]/g, '-')
}


class View {
    constructor(doc) {
        this.onChange = () => {}
        this.onMenuClickedBlacklist = () => {}
        this.onMenuClickedWhitelist = () => {}
        this.onMenuClickedTableRow = (table_id) => {}
        this.onBlacklistChange = (text) => {}
        this.onWhitelistChange = (text) => {}
        this.onRulesEditorInput = (text) => {}
        this.onPreviewEditClick = () => {}
        this.onPreviewSaveClick = () => {}

        this.form = doc.querySelector('[id="settings"]')
        this.enabled = this.form.querySelector('input[id="ext_enabled"]')
        this.enabled.addEventListener('change', () => { this._onEnabledChange() })

        this.tables_pane = doc.querySelector('[id="translit_tables"]')
        this.active_tables = new Set()

        this._selected_menu_item = undefined
        this.details_pane = doc.querySelector('[id="details"]')
        this.details_actions_pane = doc.querySelector('[id="details-actions"]')

        const blacklist_pane = this.form.querySelector('[id="menu-site-blacklist"]')
        this.blacklist_enabled = blacklist_pane.querySelector('input')
        this.blacklist_item = blacklist_pane.querySelector('span')
        this.blacklist_enabled.addEventListener('click', (event) => { event.stopPropagation() }, false)
        this.blacklist_enabled.addEventListener('change', () => { this._onBlacklistEnabledChange() })
        blacklist_pane.addEventListener('click', () => { this._onBlacklistMenuClicked() })

        const whitelist_pane = this.form.querySelector('[id="menu-site-whitelist"]')
        this.whitelist_enabled = whitelist_pane.querySelector('input')
        this.whitelist_item = whitelist_pane.querySelector('span')
        this.whitelist_enabled.addEventListener('click', (event) => { event.stopPropagation() }, false)
        this.whitelist_enabled.addEventListener('change', () => { this._onWhitelistEnabledChange() })
        whitelist_pane.addEventListener('click', () => { this._onWhitelistMenuClicked() })
    }

    _changed() {
        this.onChange()
    }

    _onEnabledChange() {
        this._changed()
    }

    _onBlacklistEnabledChange() {
        this._changed()
    }

    _onWhitelistEnabledChange() {
        this._changed()
    }

    _onBlacklistMenuClicked() {
        this.onMenuClickedBlacklist()
    }

    _onWhitelistMenuClicked() {
        this.onMenuClickedWhitelist()
    }

    set_table_list(value, active) {
        this.active_tables.clear()

        const pane = Dom.el('div')

        value.forEach((table) => {
            const chk = Dom.el('input')
            const table_id = table.id
            const element_id = _safe_element_id(table_id)
            chk.type = 'checkbox'
            chk.name = 'chk-' + element_id

            if (active.has(table_id)) {
                chk.checked = true
                this.active_tables.add(table_id)
            }

            chk.addEventListener('click', (event) => { event.stopPropagation() }, false)
            chk.addEventListener('change', () => { this._onTableChkChange(chk, table_id) })

            const text = Dom.el('span')
            text.textContent = table.title || table.id

            const row = Dom.el('div', ['menu-row'])
            row.id = 'menu-' + element_id

            row.appendChild(chk)
            row.appendChild(text)

            row.addEventListener('click', () => { this._onTableRowClicked(table_id) })

            pane.appendChild(row)
        })

        const old = this.tables_pane.querySelector('div')
        this.tables_pane.replaceChild(pane, old)
    }

    _onTableChkChange(chk, table_id) {
        if (chk.checked) {
            this.active_tables.add(table_id)
        }
        else {
            this.active_tables.delete(table_id)
        }

        this._changed()
    }

    _onTableRowClicked(table_id) {
        this.onMenuClickedTableRow(table_id)
    }

    get selected_menu_row() {
        return this._selected_menu_item
    }

    set selected_menu_row(item_id) {
        if (this._selected_menu_item) {
            const el = this.form.querySelector('#menu-' + this._selected_menu_item)
            if (el) {
                el.classList.remove('menu-row-selected')
            }
        }

        const el = this.form.querySelector('#menu-' + item_id)
        if (el) {
            el.classList.add('menu-row-selected')
        }

        this._selected_menu_item = item_id
    }

    clear_details() {
        let pane = Dom.el('div')
        Dom.resetChildren(this.details_pane, pane)
        this._show_detail_actions([])
    }

    show_table_details(table, actions) {
        this._show_table_rules(table)
        this._show_detail_actions(actions)
    }

    show_table_editor(table, text, actions) {
        this._show_rules_editor(table, text)
        this._show_detail_actions(actions)
    }

    show_share_pane(table, actions) {
        this._show_sharing(table)
        this._show_detail_actions(actions)
    }

    _show_table_rules(table) {
        let pane = this.details_pane.querySelector('div')

        let title = pane.querySelector('.details-title')
        let description = pane.querySelector('.details-descr')
        let rules_pane = pane.querySelector('.rules')

        if (!rules_pane) {
            const old = pane
            pane = Dom.el('div')
            this.details_pane.replaceChild(pane, old)

            title = Dom.el('div', ['details-title'])
            pane.appendChild(title)

            description = Dom.el('div', ['details-descr'])
            pane.appendChild(description)

            rules_pane = Dom.el('div', ['rules'])
            pane.appendChild(rules_pane)
        }

        title.textContent = table.title

        const desc = markdown.render(table.description)
        Dom.resetChildren(description, desc)

        const loabc = 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя'
        const nbsp = '\u00A0'

        function codePoint(s) {
            if (s.codePointAt) {
                return s.codePointAt(0)
            }
            return s.charCodeAt(0)
        }

        const rule_tag = (ch) => 'rule-' + codePoint(ch).toString(16)

        const print_char = (ch) => {
            const code = codePoint(ch)
            if ((code >= 0x02B0 && code < 0x0370)) {
                return [nbsp, ch].join('')
            }
            return ch
        }

        const rule_cell = (pane, rules, ch) => {
            const lokey = ch.toLocaleLowerCase()
            const hikey = ch.toLocaleUpperCase()

            let cell = pane.querySelector('#' + rule_tag(lokey))
            if (!cell) {
                cell = Dom.el('div', ['rule-cell'])
                cell.id = rule_tag(lokey)
                pane.appendChild(cell)
            }
            else {
                Dom.resetChildren(cell)
            }


            {
                const main_row = Dom.el('div', ['rule-main'])

                const source = Dom.el('div', ['rule-thumb'])
                source.appendChild(Dom.text([hikey, nbsp, lokey].join('')))
                main_row.appendChild(source)

                let rule = rules[ch]

                if (rule === undefined || rule === null) {
                    rule = ''
                }

                let value = rule

                if (typeof rule === 'object') {
                    value = rule.other
                }

                const target = Dom.el('div', ['rule-thumb'])
                target.appendChild(Dom.text([print_char(value.toLocaleUpperCase()), nbsp, print_char(value.toLocaleLowerCase())].join('')))
                main_row.appendChild(target)

                cell.appendChild(main_row)


                if (typeof rule === 'object' && 'start' in rule) {
                    const extra_row = Dom.el('div', ['rule-extra'])

                    let value = rule.start

                    const target = Dom.el('div', ['rule-thumb'])
                    target.appendChild(Dom.text(print_char(value.toLocaleLowerCase())))
                    extra_row.appendChild(target)

                    const comment = Dom.el('div')
                    comment.appendChild(Dom.text(browserapi.i18n.getMessage('rules_label_at_word_start')))
                    extra_row.appendChild(comment)

                    cell.appendChild(extra_row)
                }

                if (typeof rule === 'object' && 'cons' in rule) {
                    const extra_row = Dom.el('div', ['rule-extra'])

                    let value = rule.cons

                    const target = Dom.el('div', ['rule-thumb'])
                    target.appendChild(Dom.text(print_char(value.toLocaleLowerCase())))
                    extra_row.appendChild(target)

                    const comment = Dom.el('div')
                    comment.appendChild(Dom.text(browserapi.i18n.getMessage('rules_label_after_consonants')))
                    extra_row.appendChild(comment)

                    cell.appendChild(extra_row)
                }
            }


            const extra = Object.keys(rules).filter((key) => key.startsWith(lokey) && key !== lokey)

            extra.forEach((key) => {
                const extra_row = Dom.el('div', ['rule-extra'])

                const source = Dom.el('div', ['rule-thumb'])
                source.appendChild(Dom.text(key))
                extra_row.appendChild(source)

                let rule = rules[key]

                if (rule === undefined || rule === null) {
                    rule = ''
                }

                let value = rule

                if (typeof rule === 'object') {
                    value = rule.other
                }

                const target = Dom.el('div', ['rule-thumb'])
                target.appendChild(Dom.text(print_char(value.toLocaleLowerCase())))
                extra_row.appendChild(target)

                cell.appendChild(extra_row)
            })

            return cell
        }


        const apos_cell = (pane, rules, ch) => {
            const lokey = ch

            let cell = pane.querySelector('#' + rule_tag(lokey))
            if (!cell) {
                cell = Dom.el('div', ['rule-cell'])
                cell.id = rule_tag(lokey)
                pane.appendChild(cell)
            }
            else {
                Dom.resetChildren(cell)
            }

            const extra_row = Dom.el('div', ['rule-extra'])

            const source = Dom.el('div', ['rule-thumb'])
            source.appendChild(Dom.text(ch))
            extra_row.appendChild(source)

            let rule = rules[ch]

            if (rule === undefined || rule === null) {
                rule = ''
            }

            const target = Dom.el('div', ['rule-thumb'])
            target.appendChild(Dom.text(print_char(rule.toLocaleLowerCase())))
            extra_row.appendChild(target)

            const comment = Dom.el('div')
            comment.appendChild(Dom.text(browserapi.i18n.getMessage('rules_label_apostrophe')))
            extra_row.appendChild(comment)

            cell.appendChild(extra_row)
            return cell
        }


        loabc.split('').forEach((ch) => {
            rule_cell(rules_pane, table.rules, ch)
        })

        apos_cell(rules_pane, table.rules, '\'')
    }

    _show_rules_editor(table, text) {
        const pane = Dom.el('div')

        {
            const title_pane = Dom.el('div', ['title-editor'])
            pane.appendChild(title_pane)

            var title = Dom.el('input')
            title.value = table.title
            title_pane.appendChild(title)

            const rules_pane = Dom.el('div', ['rules-editor'])
            pane.appendChild(rules_pane)

            const textarea = Dom.el('textarea')
            rules_pane.appendChild(textarea)

            textarea.value = text

            textarea.addEventListener('input', () => { this.onRulesEditorInput(textarea.value) })
        }

        {
            const info_pane = Dom.el('div', ['editor-info'])
            pane.appendChild(info_pane)

            const status = Dom.el('div', ['status'])
            info_pane.appendChild(status)

            const preview = Dom.el('div', ['preview'])
            info_pane.appendChild(preview)

            const textarea = Dom.el('textarea')
            preview.appendChild(textarea)
            textarea.readOnly = true

            const editPreview = Dom.el('button', ['edit-preview'])
            editPreview.textContent = 'edit'
            preview.appendChild(editPreview)

            const savePreview = Dom.el('button', ['save-preview'])
            savePreview.textContent = 'save'
            savePreview.style.display = 'none'
            preview.appendChild(savePreview)

            editPreview.addEventListener('click', () => { this.onPreviewEditClick() })
            savePreview.addEventListener('click', () => { this.onPreviewSaveClick() })
        }

        Dom.resetChildren(this.details_pane, pane)

        title.focus()
    }

    get preview_text() {
        const textarea = this.details_pane.querySelector('.editor-info .preview textarea')
        return textarea.value
    }

    set preview_text(value) {
        const textarea = this.details_pane.querySelector('.editor-info .preview textarea')
        textarea.value = value
    }

    preview_edit_mode(text, isEdit) {
        this.preview_text = text

        const preview_pane = this.details_pane.querySelector('.editor-info .preview')
        const textarea = preview_pane.querySelector('textarea')
        const editButton = preview_pane.querySelector('.edit-preview')
        const saveButton = preview_pane.querySelector('.save-preview')

        editButton.style.display = isEdit ? 'none' : 'inherit'
        saveButton.style.display = isEdit ? 'inherit' : 'none'
        textarea.readOnly = !isEdit
        this.rules_editor.readOnly = isEdit

        if (isEdit) {
            textarea.focus()
        }
    }

    get rules_editor_error() {
        const error = this.details_pane.querySelector('.editor-info .status')
        return error.textContent
    }

    set rules_editor_error(value) {
        const error = this.details_pane.querySelector('.editor-info .status')
        error.textContent = value

        const saveButton = this.details_actions_pane.querySelector('#action-save-edit')
        saveButton.disabled = !!value

        const preview_pane = this.details_pane.querySelector('.editor-info .preview')
        const previewEditButton = preview_pane.querySelector('.edit-preview')
        previewEditButton.style.display = !!value ? 'none' : 'inherit'
    }

    _show_sharing(table) {
        let details = this.details_pane.querySelector('div')
        let rules_pane = details.querySelector('.rules') || details.querySelector('.share')

        function link_row(url, description) {
            let row = Dom.el('div', ['share-row'])

            let desc = Dom.el('div', ['share-descr'])
            desc.appendChild(Dom.text(description))
            row.appendChild(desc)

            let copy = Dom.el('button')
            copy.appendChild(Dom.text('Copy'))
            row.appendChild(copy)

            let link = Dom.el('input')
            link.type = "text"
            link.readOnly = true
            link.value = url
            row.appendChild(link)

            copy.addEventListener('click', () => {
                link.select()
                document.execCommand('copy')
            })

            return row
        }

        let pane = Dom.el('div', ['share'])

        let full_pane = link_row(table.share_link, 'Full URL:')
        full_pane.classList.add('full-link')
        pane.appendChild(full_pane)

        const placeholder = 'loading...'

        let short_pane = link_row(table.short_share_link || placeholder, 'Short URL:')
        short_pane.classList.add('short-link')
        pane.appendChild(short_pane)

        details.replaceChild(pane, rules_pane)
    }

    get rules_editor() {
        return this.details_pane.querySelector('.rules-editor > textarea')
    }

    get title_editor() {
        return this.details_pane.querySelector('.title-editor > input')
    }

    _show_detail_actions(actions) {
        let pane = Dom.el('div')

        actions.forEach((action) => {
            const button = Dom.el('button')
            button.id = action.id
            button.appendChild(Dom.text(action.title))
            button.addEventListener('click', action.handler)
            pane.appendChild(button)
        })

        let old = this.details_actions_pane.querySelector('div')
        this.details_actions_pane.replaceChild(pane, old)
    }

    get confirm_delete_visible() {
        return !!this.details_actions_pane.querySelector('.confirm-delete')
    }

    set confirm_delete_visible(value) {
        const pane = this.details_actions_pane.querySelector('div')

        let el = pane.querySelector('.confirm-delete')
        if (!value) {
            if (el) {
                pane.removeChild(el)
            }
        }
        else {
            if (!el) {
                el = Dom.el('div', ['confirm-delete'])
                el.textContent = browserapi.i18n.getMessage('options_table_confirm_delete')

                const actionDelete = pane.querySelector('[id="action-delete"]')
                if (actionDelete) {
                    pane.insertBefore(el, actionDelete)
                }
                else {
                    pane.appendChild(el)
                }
            }
        }
    }

    _show_blackwhitelist_details(title, description, list_rules) {
        this._show_detail_actions([])

        const old = this.details_pane.querySelector('div')
        const pane = Dom.el('div')

        const title_pane = Dom.el('div', ['details-title'])
        pane.appendChild(title_pane)
        title_pane.appendChild(Dom.text(title))

        const descr_pane = Dom.el('div', ['details-descr'])
        pane.appendChild(descr_pane)
        descr_pane.appendChild(Dom.text(description))

        const rules_pane = Dom.el('div', ['site-list'])
        pane.appendChild(rules_pane)

        const rules = Dom.el('textarea')
        rules_pane.appendChild(rules)
        rules.value = list_rules.join('\n')

        this.details_pane.replaceChild(pane, old)
    }

    show_blacklist_details(blacklist) {
        this._show_blackwhitelist_details(
            browserapi.i18n.getMessage('options_blacklist_details_title'),
            browserapi.i18n.getMessage('options_blacklist_details_description'),
            blacklist)

        const textarea = this.details_pane.querySelector('textarea')
        textarea.addEventListener('change', () => { this.onBlacklistChange(textarea.value) })
    }

    show_whitelist_details(whitelist) {
        this._show_blackwhitelist_details(
            browserapi.i18n.getMessage('options_whitelist_details_title'),
            browserapi.i18n.getMessage('options_whitelist_details_description'),
            whitelist)

            const textarea = this.details_pane.querySelector('textarea')
            textarea.addEventListener('change', () => { this.onWhitelistChange(textarea.value) })
    }
}


class Controller {
    constructor() {
        this.settings = new Settings(browserapi.storage, () => { this._reloadView() })
        this.view = new View(document)

        this._localize_html(document)

        this.view.onChange = () => { this._storeSettings() }
        this.view.onMenuClickedBlacklist = () => { this._showBlacklistDetails() }
        this.view.onMenuClickedWhitelist = () => { this._showWhitelistDetails() }
        this.view.onMenuClickedTableRow = (table_id) => { this._showTableDetails(table_id) }
        this.view.onBlacklistChange = (text) => { this._storeBlacklist(text) }
        this.view.onWhitelistChange = (text) => { this._storeWhitelist(text) }
        this.view.onRulesEditorInput = (text) => { this._checkRulesEditorInput(text) }
        this.view.onPreviewEditClick = () => { this._editPreviewText() }
        this.view.onPreviewSaveClick = () => { this._savePreviewText() }
    }

    _storeSettings() {
        this.settings.save({
            enabled: this.view.enabled.checked,
            blacklist_enabled: this.view.blacklist_enabled.checked,
            whitelist_enabled: this.view.whitelist_enabled.checked,
            active_table_ids: [...this.view.active_tables],
        })
    }

    _storeBlacklist(text) {
        this.settings.set_site_blacklist_from_text(text)
    }

    _storeWhitelist(text) {
        this.settings.set_site_whitelist_from_text(text)
    }

    _reloadView() {
        this.view.enabled.checked = this.settings.enabled
        this.view.blacklist_enabled.checked = this.settings.blacklist_enabled
        this.view.whitelist_enabled.checked = this.settings.whitelist_enabled
        this.view.set_table_list(this.settings.all_tables(), new Set(this.settings.active_table_ids))

        if (this.view.selected_menu_row === 'site-blacklist') {
            this.view.show_blacklist_details(this.settings.site_blacklist)
        }
        else if (this.view.selected_menu_row === 'site-whitelist') {
            this.view.show_whitelist_details(this.settings.site_whitelist)
        }
        else if (this.selected_table_id) {
            if (this._in_edit_mode) {
                this._editMode(this.selected_table_id, this.rules_text)
            }
            else {
                this._showTableDetails(this.selected_table_id)
            }
        }
        else {
            this.view.clear_details()
        }
    }

    _localize_html(doc) {
        html_i18n.localize(doc)
    }

    _showBlacklistDetails() {
        this.view.selected_menu_row = 'site-blacklist'
        this.selected_table_id = null
        this.view.show_blacklist_details(this.settings.site_blacklist)
    }

    _showWhitelistDetails() {
        this.view.selected_menu_row = 'site-whitelist'
        this.selected_table_id = null
        this.view.show_whitelist_details(this.settings.site_whitelist)
    }

    _showTableDetails(table_id) {
        const table = this.settings.get_table(table_id) || {}
        table_id = table.id

        if (!table.rules) {
            table.rules = {}
        }

        this._in_edit_mode = false
        this.selected_table_id = table_id

        const element_id = _safe_element_id(table_id)
        const is_bundled = table_id && !(/\./.test(table_id))

        this.view.selected_menu_row = element_id

        const actions = []

        actions.push({
            id: 'action-share',
            title: browserapi.i18n.getMessage('options_table_action_share'),
            handler: () => { this._sharingMode(table_id) }
        })

        if (is_bundled) {
            actions.push({
                id: 'action-edit',
                title: browserapi.i18n.getMessage('options_table_action_edit'),
                handler: () => { this._createEditableCopy(table_id, true) }
            })
        }
        else {
            actions.push({
                id: 'action-edit',
                title: browserapi.i18n.getMessage('options_table_action_edit'),
                handler: () => { this._editMode(table_id) }
            })

            actions.push({
                id: 'action-copy',
                title: browserapi.i18n.getMessage('options_table_action_copy'),
                handler: () => { this._createEditableCopy(table_id) }
            })

            actions.push({
                id: 'action-delete',
                title: browserapi.i18n.getMessage('options_table_action_delete'),
                handler: () => { this._deleteTable(table_id) }
            })
        }

        this.view.show_table_details(table, actions)
    }

    _createEditableCopy(table_id, edit_mode) {
        const table = this.settings.get_table(table_id) || {}
        const seq_no = this.settings.user_tables_seq_no

        const newtable = {
            id: this.settings.generate_table_id(table.id, seq_no),
            seq_no: seq_no,
            title: this._generate_table_title(table.title),
            rules: JSON.parse(JSON.stringify(table.rules)),
        }

        if (!newtable.rules) {
            newtable.rules = {}
        }

        this.view.selected_menu_row = _safe_element_id(newtable.id)
        this.selected_table_id = newtable.id
        this.rules_text = undefined
        this._in_edit_mode = edit_mode

        this.settings.import_table(newtable)
    }

    _generate_table_title(from_title) {
        const prefix = browserapi.i18n.getMessage('options_table_title_copy_prefix')

        if (from_title && from_title.startsWith(prefix)) {
            from_title = from_title.substring(prefix.length)
            const match = /^\s*\((\d+)\)\s*(.*)/.exec(from_title)
            if (match) {
                const count = parseInt(match[1], 10)
                return `${prefix}(${count + 1}) ${match[2]}`
            }
            else {
                return `${prefix}(1) ${from_title}`
            }
        }

        return `${prefix}${from_title}`
    }

    _deleteTable(table_id) {
        if (this.view.confirm_delete_visible) {
            this.selected_table_id = null
            this.settings.delete_user_table(table_id)
        }
        else {
            this.view.confirm_delete_visible = true
        }
    }

    _editMode(table_id, edited_text) {
        const table = this.settings.get_table(table_id) || {}
        table_id = table.id
        this._in_edit_mode = true
        this.view.selected_menu_row = _safe_element_id(table_id)
        this.selected_table_id = table_id

        const rules = {}
        Object.keys(table.rules)
            .sort((a,b) => a.localeCompare(b))
            .forEach((key) => rules[key] = table.rules[key])

        this.rules_text = edited_text

        try {
            if (edited_text === undefined) {
                this.rules_text = jaaml.stringify(rules)
            }
        }
        catch (e) {
            this.rules_text = e.toString()
        }

        const actions = []

        actions.push({
            id: 'action-save-edit',
            title: browserapi.i18n.getMessage('options_rules_editor_save'),
            handler: () => { this._saveEdit(table) }
        })

        actions.push({
            id: 'action-cancel-edit',
            title: browserapi.i18n.getMessage('options_rules_editor_cancel'),
            handler: () => { this._cancelEdit(table_id) }
        })

        this.view.show_table_editor(table, this.rules_text, actions)

        this._checkRulesEditor(this.rules_text)
    }

    _saveEdit(table) {
        const title = this.view.title_editor.value
        const text = this.view.rules_editor.value
        let rules

        try {
            rules = jaaml.parse(text)
        }
        catch (e) {
            console.log(e.toString())
            return
        }

        const newtable = Object.assign({}, table, {rules: null, share_link: null, short_share_link: null})
        newtable.title = title
        newtable.rules = rules

        this.settings.update_user_table(newtable)

        this._showTableDetails(newtable.id)
    }

    _cancelEdit(table_id) {
        this._showTableDetails(table_id)
    }

    _sharingMode(table_id) {
        const table = this.settings.get_table(table_id) || {}
        table_id = table.id

        if (!table.share_link) {
            table.share_link = sharer.makeShareLink(table)
        }

        const actions = []

        actions.push({
            id: 'action-share-close',
            title: browserapi.i18n.getMessage('share_dialog_close'),
            handler: () => { this._showTableDetails(table_id) }
        })

        this.view.show_share_pane(table, actions)

        if (!table.short_share_link) {
            urlshortener.shorten(table.share_link, (short_url) => {
                table.short_share_link = short_url

                if (this.selected_table_id == table_id) {
                    this.view.show_share_pane(table, actions)
                }
            })
        }
    }

    _checkRulesEditorInput(text) {
        this._delayed_overlapping('rules-editor', 200, () => {
            this._checkRulesEditor(text)
        })
    }

    _delayed_overlapping(key, interval, handler) {
        if (!this._delayed_overlapping_ids) {
            this._delayed_overlapping_ids = new Object()
        }

        const other = this._delayed_overlapping_ids[key]
        window.clearTimeout(other)
        this._delayed_overlapping_ids[key] = window.setTimeout(handler, interval)
    }

    _checkRulesEditor(rulesText) {
        try {
            this.rules_text = rulesText
            const rules = jaaml.parse(this.rules_text)
            this._validate_rules(rules || {})
            const trx = new translit.Transliterator(rules)
            const preview = trx.convert(this.settings.preview_text)
            this.view.preview_text = preview
            this.view.rules_editor_error = ''
        }
        catch (e) {
            this.view.rules_editor_error = e.toString()
        }
    }

    _validate_rules(rules) {
        validator.validate(rules)
    }

    _editPreviewText() {
        this.view.preview_edit_mode(this.settings.preview_text, true)
    }

    _savePreviewText() {
        const previewText = this.view.preview_text

        if (this.settings.preview_text === previewText) {
            this._reloadView()
        }
        else {
            this.settings.preview_text = previewText
        }
    }
}


const ctl = new Controller()
