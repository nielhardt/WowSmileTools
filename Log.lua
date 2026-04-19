local _, ST = ...

ST.debugMode = false

local function FormatMsg(msg, ...)
    if select("#", ...) > 0 then
        msg = string.format(msg, ...)
    end
    return msg
end

local PREFIX = "|cffffcc00Smile Tools:|r "

function ST.LogInfo(msg, ...)
    print(PREFIX .. FormatMsg(msg, ...))
end

function ST.LogDebug(msg, ...)
    if not ST.debugMode then return end
    print(PREFIX .. "|cff888888" .. FormatMsg(msg, ...) .. "|r")
end
