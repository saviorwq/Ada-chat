    <!-- 帮助弹窗 -->
    <div id="helpModal" class="modal">
        <div id="helpWindow" class="modal-content help-modal-content">
            <div id="helpDragHeader" class="settings-main-header help-window-header">
                <h2 data-i18n="help_center">帮助中心</h2>
                <span class="close" onclick="closeHelpModal()">&times;</span>
            </div>
            <div id="helpContent" class="help-content"></div>
        </div>
    </div>

    <!-- Support 弹窗 -->
    <div id="supportModal" class="modal">
        <div class="modal-content support-modal-content">
            <div class="settings-main-header">
                <h2 data-i18n="support_title">Support</h2>
                <span class="close" onclick="closeSupportModal()">&times;</span>
            </div>
            <div class="support-content">
                <img id="supportQrImage" src="support-qr.png" alt="Support QR Code" data-i18n-alt="support_qr_alt">
                <p class="support-thanks" data-i18n="support_thanks">感谢你的支持与鼓励，祝你使用愉快！</p>
            </div>
        </div>
    </div>
