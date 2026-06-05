/**
 * 变量元素接口
 */
export interface VariableElement {
  /** 变量code（唯一标识） */
  code: string
  /** 字典名 */
  dictName: string
  /** 变量名 */
  variableName: string
  /** 变量类型 */
  type?: string
  /** 其他属性 */
  [key: string]: any
}

/**
 * 动态变量字典管理器
 */
export class VariableDictionary {
  /** 变量code到变量元素的映射 */
  private codeToElement: Map<string, VariableElement> = new Map()
  
  /** 显示名称到变量元素的映射（处理重名） */
  private displayNameToElements: Map<string, VariableElement[]> = new Map()
  
  /** 显示名称到code的映射（用于快速查找） */
  private displayNameToCode: Map<string, string> = new Map()

  /**
   * 添加变量到字典
   * @param element 变量元素
   * @returns 返回分配的显示名称
   */
  addVariable(element: VariableElement): string {
    const { code, dictName, variableName } = element
    
    // 检查code是否已存在
    if (this.codeToElement.has(code)) {
      console.warn(`Variable with code "${code}" already exists, skipping`)
      return this.getDisplayNameByCode(code)!
    }
    
    // 生成基础显示名称
    const baseDisplayName = `${dictName}·${variableName}`
    
    // 检查是否有重名
    const existingElements = this.displayNameToElements.get(baseDisplayName) || []
    const sameNameElements = existingElements.filter(e => 
      e.dictName === dictName && e.variableName === variableName
    )
    
    let displayName = baseDisplayName
    let suffix = 0
    
    // 如果有重名，添加后缀
    if (sameNameElements.length > 0) {
      suffix = sameNameElements.length + 1
      displayName = `${baseDisplayName}_${suffix}`
      
      // 检查新生成的显示名称是否已存在
      while (this.displayNameToCode.has(displayName)) {
        suffix++
        displayName = `${baseDisplayName}_${suffix}`
      }
    }
    
    // 存储映射关系
    this.codeToElement.set(code, element)
    
    if (!this.displayNameToElements.has(baseDisplayName)) {
      this.displayNameToElements.set(baseDisplayName, [])
    }
    this.displayNameToElements.get(baseDisplayName)!.push(element)
    
    this.displayNameToCode.set(displayName, code)
    
    return displayName
  }

  /**
   * 批量添加变量
   * @param elements 变量元素数组
   * @returns 返回显示名称数组
   */
  addVariables(elements: VariableElement[]): string[] {
    return elements.map(element => this.addVariable(element))
  }

  /**
   * 根据code获取变量元素
   * @param code 变量code
   * @returns 变量元素或null
   */
  getElementByCode(code: string): VariableElement | null {
    return this.codeToElement.get(code) || null
  }

  /**
   * 根据显示名称获取变量元素
   * @param displayName 显示名称
   * @returns 变量元素或null
   */
  getElementByDisplayName(displayName: string): VariableElement | null {
    const code = this.displayNameToCode.get(displayName)
    if (!code) return null
    return this.codeToElement.get(code) || null
  }

  /**
   * 根据code获取显示名称
   * @param code 变量code
   * @returns 显示名称或null
   */
  getDisplayNameByCode(code: string): string | null {
    for (const [displayName, elementCode] of this.displayNameToCode.entries()) {
      if (elementCode === code) {
        return displayName
      }
    }
    return null
  }

  /**
   * 检查显示名称是否存在于字典中
   * @param displayName 显示名称
   * @returns 是否存在
   */
  hasDisplayName(displayName: string): boolean {
    return this.displayNameToCode.has(displayName)
  }

  /**
   * 检查code是否存在于字典中
   * @param code 变量code
   * @returns 是否存在
   */
  hasCode(code: string): boolean {
    return this.codeToElement.has(code)
  }

  /**
   * 获取所有显示名称
   * @returns 显示名称数组
   */
  getAllDisplayNames(): string[] {
    return Array.from(this.displayNameToCode.keys())
  }

  /**
   * 获取所有变量元素
   * @returns 变量元素数组
   */
  getAllElements(): VariableElement[] {
    return Array.from(this.codeToElement.values())
  }

  /**
   * 清空字典
   */
  clear(): void {
    this.codeToElement.clear()
    this.displayNameToElements.clear()
    this.displayNameToCode.clear()
  }

  /**
   * 获取字典中变量的数量
   * @returns 变量数量
   */
  size(): number {
    return this.codeToElement.size
  }

  /**
   * 根据code删除变量
   * @param code 变量code
   * @returns 是否删除成功
   */
  removeByCode(code: string): boolean {
    const element = this.codeToElement.get(code)
    if (!element) return false
    
    // 获取显示名称
    const displayName = this.getDisplayNameByCode(code)
    if (displayName) {
      // 从 displayNameToCode 中移除
      this.displayNameToCode.delete(displayName)
    }
    
    // 从 displayNameToElements 中移除
    const baseDisplayName = `${element.dictName}·${element.variableName}`
    const existingElements = this.displayNameToElements.get(baseDisplayName)
    if (existingElements) {
      const index = existingElements.findIndex(e => e.code === code)
      if (index !== -1) {
        existingElements.splice(index, 1)
        if (existingElements.length === 0) {
          this.displayNameToElements.delete(baseDisplayName)
        }
      }
    }
    
    // 从 codeToElement 中移除
    this.codeToElement.delete(code)
    
    return true
  }

  /**
   * 根据显示名称删除变量
   * @param displayName 显示名称
   * @returns 是否删除成功
   */
  removeByDisplayName(displayName: string): boolean {
    const code = this.displayNameToCode.get(displayName)
    if (!code) return false
    return this.removeByCode(code)
  }
}

// 创建全局变量字典实例
export const variableDictionary = new VariableDictionary()