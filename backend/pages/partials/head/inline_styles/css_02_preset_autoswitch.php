        /* 预设管理列表样式 (复用部分通用样式，此处做微调) */
        .preset-list {
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            margin-bottom: 20px;
            max-height: 300px;
            overflow-y: auto;
            background: var(--bg);
        }

        .preset-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
            cursor: pointer;
            transition: var(--transition);
        }

        .preset-item:last-child { border-bottom: none; }
        .preset-item:hover { background: var(--bg-light); }
        
        .preset-item.active {
            background: rgba(16, 185, 129, 0.1);
            border-left: 3px solid var(--primary);
        }

        .preset-name { font-weight: 600; flex: 1; }
        
        .preset-type-badge {
            font-size: 12px;
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            background: var(--border);
            margin: 0 10px;
            color: var(--text-light);
        }

        .preset-actions button {
            background: none;
            border: none;
            cursor: pointer;
            margin: 0 4px;
            font-size: 16px;
            color: var(--text-light);
            transition: color 0.2s;
        }

        .preset-actions button:hover { color: var(--primary); }
        .preset-actions .delete-preset:hover { color: var(--danger); }

        /* 自动切换开关（控件行内） */
        .auto-switch-toggle {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            height: 42px;
            padding: 0 10px;
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            background: var(--bg);
            transition: var(--transition);
            user-select: none;
            white-space: nowrap;
            font-size: 13px;
        }
        .auto-switch-toggle:hover { background: var(--bg-light); }
        .auto-switch-toggle input[type="checkbox"] {
            width: 16px; height: 16px; margin: 0; cursor: pointer;
            accent-color: var(--primary);
        }
        .auto-switch-text { color: var(--text-light); font-size: 13px; }
        .auto-switch-toggle:has(input:checked) {
            border-color: var(--primary);
            background: rgba(16, 185, 129, 0.08);
        }
        .auto-switch-toggle:has(input:checked) .auto-switch-text {
            color: var(--primary);
        }

        /* 自动切换 Toast 通知 */
        .auto-switch-toast {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(-80px);
            background: var(--primary);
            color: #fff;
            padding: 10px 24px;
            border-radius: var(--radius-xl);
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
            opacity: 0;
            transition: transform 0.3s ease, opacity 0.3s ease;
            pointer-events: none;
        }
        .auto-switch-toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }

        /* 设置面板中的模型列表 */
        .auto-switch-model-list {
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            max-height: 400px;
            overflow-y: auto;
            background: var(--bg);
            margin-top: 12px;
        }
        .auto-switch-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-bottom: 1px solid var(--border);
            transition: background 0.15s;
            cursor: grab;
        }
        .auto-switch-item:last-child { border-bottom: none; }
        .auto-switch-item:hover { background: var(--bg-light); }
        .auto-switch-item.checked { background: rgba(16, 185, 129, 0.06); }
        .auto-switch-item.dragging { opacity: 0.4; background: var(--border); }
        .drag-handle {
            color: var(--text-light);
            cursor: grab;
            font-size: 16px;
            line-height: 1;
            user-select: none;
        }
        .auto-switch-cb {
            width: 16px; height: 16px; margin: 0; cursor: pointer;
            accent-color: var(--primary);
        }
        .auto-switch-model-name {
            flex: 1;
            font-size: 14px;
            font-weight: 500;
            color: var(--text);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .auto-switch-provider-badge {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            background: var(--border);
            color: var(--text-light);
            white-space: nowrap;
        }
        .auto-switch-type-badge {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: var(--radius-sm);
            background: rgba(16, 185, 129, 0.12);
            color: var(--primary);
            white-space: nowrap;
        }

        .auto-switch-group-header {
            font-size: 13px;
            font-weight: 600;
            padding: 10px 14px 6px;
            color: var(--text-light);
            border-bottom: 1px solid var(--border);
            background: var(--bg-light);
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .auto-switch-group-header:first-child {
            border-radius: var(--radius-md) var(--radius-md) 0 0;
        }
        .auto-switch-group {
            margin-bottom: 4px;
        }

