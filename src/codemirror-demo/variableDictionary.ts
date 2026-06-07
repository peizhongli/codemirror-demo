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
  
  /** 显示名称（字典名·变量名）到变量元素数组的映射（允许重名） */
  private displayNameToElements: Map<string, VariableElement[]> = new Map()

  /**
   * 添加变量到字典（允许重名）
   * @param element 变量元素
   * @returns 返回显示名称（字典名·变量名）
   */
  addVariable(element: VariableElement): string {
    const { code, dictName, variableName } = element
    
    // 检查code是否已存在
    if (this.codeToElement.has(code)) {
      console.warn(`Variable with code "${code}" already exists, skipping`)
      return this.getDisplayNameByCode(code)!
    }
    
    // 生成显示名称（不再添加后缀，允许重名）
    const displayName = `${dictName}·${variableName}`
    
    // 存储映射关系
    this.codeToElement.set(code, element)
    
    // 维护显示名称到变量数组的映射（支持重名）
    if (!this.displayNameToElements.has(displayName)) {
      this.displayNameToElements.set(displayName, [])
    }
    this.displayNameToElements.get(displayName)!.push(element)
    
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
   * 根据显示名称获取所有同名变量元素
   * @param displayName 显示名称
   * @returns 变量元素数组
   */
  getElementsByDisplayName(displayName: string): VariableElement[] {
    return this.displayNameToElements.get(displayName) || []
  }

  /**
   * 根据显示名称获取第一个变量元素
   * @param displayName 显示名称
   * @returns 变量元素或null
   */
  getElementByDisplayName(displayName: string): VariableElement | null {
    const elements = this.displayNameToElements.get(displayName)
    return elements ? elements[0] : null
  }

  /**
   * 根据code获取显示名称
   * @param code 变量code
   * @returns 显示名称或null
   */
  getDisplayNameByCode(code: string): string | null {
    const element = this.codeToElement.get(code)
    if (!element) return null
    return `${element.dictName}·${element.variableName}`
  }

  /**
   * 检查显示名称是否存在于字典中
   * @param displayName 显示名称
   * @returns 是否存在
   */
  hasDisplayName(displayName: string): boolean {
    return this.displayNameToElements.has(displayName)
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
   * 获取所有显示名称（包含重复）
   * @returns 显示名称数组
   */
  getAllDisplayNames(): string[] {
    const result: string[] = []
    for (const [displayName, elements] of this.displayNameToElements) {
      for (let i = 0; i < elements.length; i++) {
        result.push(displayName)
      }
    }
    return result
  }

  /**
   * 获取所有不重复的显示名称
   * @returns 不重复的显示名称数组
   */
  getUniqueDisplayNames(): string[] {
    return Array.from(this.displayNameToElements.keys())
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
    
    // 从 displayNameToElements 中移除
    const displayName = `${element.dictName}·${element.variableName}`
    const existingElements = this.displayNameToElements.get(displayName)
    if (existingElements) {
      const index = existingElements.findIndex(e => e.code === code)
      if (index !== -1) {
        existingElements.splice(index, 1)
        if (existingElements.length === 0) {
          this.displayNameToElements.delete(displayName)
        }
      }
    }
    
    // 从 codeToElement 中移除
    this.codeToElement.delete(code)
    
    return true
  }

  /**
   * 根据显示名称删除第一个匹配的变量
   * @param displayName 显示名称
   * @returns 是否删除成功
   */
  removeByDisplayName(displayName: string): boolean {
    const elements = this.displayNameToElements.get(displayName)
    if (!elements || elements.length === 0) return false
    
    const firstElement = elements[0]
    return this.removeByCode(firstElement.code)
  }
}

// 创建全局变量字典实例
export const variableDictionary = new VariableDictionary()