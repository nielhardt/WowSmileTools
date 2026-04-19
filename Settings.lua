local _, ST = ...

function ST:InitSettings()
    local category = Settings.RegisterVerticalLayoutCategory("Smile Tools")
    ST.settingsCategory = category

    local layout = SettingsPanel:GetLayout(category)

    local function addHeader(name, tooltip)
        local headerData = { name = name, tooltip = tooltip }
        local headerInitializer = Settings.CreateElementInitializer("SettingsListSectionHeaderTemplate", headerData)
        layout:AddInitializer(headerInitializer)
    end

    -- Ready Check Alerts
    addHeader("Ready Check Alerts", "Alerts that trigger when a ready check is initiated.")

    local soulstoneCheck = Settings.RegisterAddOnSetting(
        category,
        "ST_SOULSTONE_CHECK",
        "soulstoneCheck",
        SmileToolsDB,
        type(true),
        "Enable Soulstone Check",
        true
    )
    Settings.CreateCheckbox(category, soulstoneCheck,
        "When a ready check is started, checks if any healer in the raid has Soulstone applied. " ..
        "Soulstone status is logged, and if an announce channel is set, a warning is sent in chat."
    )

    local function GetChannelOptions()
        local container = Settings.CreateControlTextContainer()
        container:Add("NONE", "None")
        container:Add("RAID_WARNING", "Raid Warning")
        container:Add("RAID", "Raid")
        container:Add("PARTY", "Party")
        container:Add("SAY", "Say")
        return container:GetData()
    end

    local channelSetting = Settings.RegisterAddOnSetting(
        category,
        "ST_ANNOUNCE_CHANNEL",
        "announceChannel",
        SmileToolsDB,
        type(""),
        "Announce Channel",
        "RAID_WARNING"
    )
    local channelInitializer = Settings.CreateDropdown(category, channelSetting, GetChannelOptions,
        "The chat channel to use for announcements. " ..
        "Raid Warning will only announce when you are a raid leader or assistant. " ..
        "Set to None to disable announcements and only log results."
    )

    channelInitializer:AddModifyPredicate(function()
        return soulstoneCheck:GetValue()
    end)

    Settings.RegisterAddOnCategory(category)
end
